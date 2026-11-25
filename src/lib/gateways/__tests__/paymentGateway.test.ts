import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./supabaseMock";

const mock = createSupabaseMock();
vi.mock("@/lib/supabaseClient", () => ({ supabase: mock }));

const { paymentGateway } = await import("../paymentGateway");

beforeEach(() => {
  vi.clearAllMocks();
  mock._result = { data: null, error: null };
  mock._tableResults = {};
  mock._consumed = {};
  mock._calls = [];
});

const calls = (table: string, method: string) =>
  mock._calls.filter((c) => c.table === table && c.method === method);

describe("paymentGateway.previewGenerateMonth", () => {
  it("throws when ym is missing", async () => {
    await expect(paymentGateway.previewGenerateMonth({} as never)).rejects.toThrow("obrigatório");
  });

  it("filters students with zero value", async () => {
    mock._tableResults.students = {
      data: [
        { id: "1", name: "João", monthly_value: 500, due_day: 10, payer_id: "p1" },
        { id: "2", name: "Maria", monthly_value: 0, due_day: 5, payer_id: null },
      ],
      error: null,
    };
    mock._tableResults.payments = { data: [], error: null };
    const result = await paymentGateway.previewGenerateMonth({ ym: "2024-03" });
    expect(result).toHaveLength(1);
    expect(result[0].student_id).toBe("1");
    expect(result[0].due_date).toBe("2024-03-10");
  });

  // A1: a Prévia usa a MESMA regra do Gerar (banco, por competence_month).
  // A6: mês cancelado também conta como "já existe" (Reabrir é explícito).
  it("exclui alunos que já têm lançamento no mês, inclusive cancelado", async () => {
    mock._tableResults.students = {
      data: [
        { id: "1", name: "João", monthly_value: 500, due_day: 10 },
        { id: "2", name: "Maria", monthly_value: 300, due_day: 5 },
      ],
      error: null,
    };
    mock._tableResults.payments = { data: [{ student_id: "1" }], error: null };
    const result = await paymentGateway.previewGenerateMonth({ ym: "2026-11" });
    expect(result.map((r) => r.student_id)).toEqual(["2"]);
    expect(calls("payments", "eq")[0].args).toEqual(["competence_month", "2026-11-01"]);
    expect(calls("payments", "neq")).toHaveLength(0);
  });

  it("limita o dia de vencimento a 28 (não transborda de mês)", async () => {
    mock._tableResults.students = {
      data: [{ id: "1", name: "João", monthly_value: 500, due_day: 31 }],
      error: null,
    };
    mock._tableResults.payments = { data: [], error: null };
    const [p] = await paymentGateway.previewGenerateMonth({ ym: "2026-02" });
    expect(p.due_date).toBe("2026-02-28");
  });
});

describe("paymentGateway.generateMonth", () => {
  const students = {
    data: [
      { id: "1", name: "João", monthly_value: 500, due_day: 10, payer_id: "p1" },
      { id: "2", name: "Maria", monthly_value: 300, due_day: 5, payer_id: "p2" },
    ],
    error: null,
  };
  const payers = { data: [{ id: "p1", name: "Pai João" }, { id: "p2", name: "Mãe Maria" }], error: null };

  it("retorna sempre { inserted, skipped_existing, created_payers }", async () => {
    mock._tableResults.students = students;
    mock._tableResults.payers = payers;
    mock._tableResults.payments = [
      { data: [{ student_id: "1" }], error: null }, // existentes
      { data: null, error: null }, // insert
    ];
    const res = await paymentGateway.generateMonth({ ym: "2026-11" });
    expect(res).toEqual({ inserted: 1, skipped_existing: 1, created_payers: 0 });
    const inserted = calls("payments", "insert")[0].args[0] as Array<Record<string, unknown>>;
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ student_id: "2", due_date: "2026-11-05", competence_month: "2026-11-01" });
  });

  it("nada a gerar → inserted 0 sem chamar insert", async () => {
    mock._tableResults.students = students;
    mock._tableResults.payments = { data: [{ student_id: "1" }, { student_id: "2" }], error: null };
    const res = await paymentGateway.generateMonth({ ym: "2026-11" });
    expect(res).toEqual({ inserted: 0, skipped_existing: 2, created_payers: 0 });
    expect(calls("payments", "insert")).toHaveLength(0);
  });

  // A6: antes o mapErr descartava o code e o lote inteiro falhava.
  it("duplicado em lote → re-tenta linha a linha ignorando os duplicados", async () => {
    mock._tableResults.students = students;
    mock._tableResults.payers = payers;
    mock._tableResults.payments = [
      { data: [], error: null }, // existentes
      { data: null, error: { code: "23505", message: "duplicate key" } }, // lote
      { data: null, error: { code: "23505", message: "duplicate key" } }, // linha 1 (dup)
      { data: null, error: null }, // linha 2 ok
    ];
    const res = await paymentGateway.generateMonth({ ym: "2026-11" });
    expect(res).toEqual({ inserted: 1, skipped_existing: 1, created_payers: 0 });
  });

  it("erro que não é duplicado é propagado (não engole)", async () => {
    mock._tableResults.students = students;
    mock._tableResults.payers = payers;
    mock._tableResults.payments = [
      { data: [], error: null },
      { data: null, error: { code: "42501", message: "row-level security" } },
    ];
    await expect(paymentGateway.generateMonth({ ym: "2026-11" })).rejects.toThrow("permissão");
  });
});

describe("paymentGateway.listPayments", () => {
  it("throws when ym is missing", async () => {
    await expect(paymentGateway.listPayments({} as never)).rejects.toThrow("obrigatório");
  });

  // A3: janela por string, independente do fuso.
  it.each([
    ["2026-02", "2026-02-01", "2026-03-01"],
    ["2026-03", "2026-03-01", "2026-04-01"],
    ["2026-04", "2026-04-01", "2026-05-01"],
    ["2026-12", "2026-12-01", "2027-01-01"],
  ])("janela de %s = [%s, %s)", async (ym, start, end) => {
    mock._result = { data: [], error: null };
    await paymentGateway.listPayments({ ym });
    expect(calls("payments", "gte")[0].args).toEqual(["due_date", start]);
    expect(calls("payments", "lt")[0].args).toEqual(["due_date", end]);
  });

  // A2: sem pageSize traz o mês inteiro (antes cortava em 50).
  it("sem pageSize pagina até trazer todas as linhas", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}`, status: "pending", due_date: "2026-11-10", amount: 1 }));
    const page2 = [{ id: "b0", status: "paid", due_date: "2026-11-25", amount: 1 }];
    mock._tableResults.payments = [{ data: page1, error: null }, { data: page2, error: null }];
    const res = await paymentGateway.listPayments({ ym: "2026-11" });
    expect(res.rows).toHaveLength(1001);
    expect(calls("payments", "range").map((c) => c.args)).toEqual([[0, 999], [1000, 1999]]);
  });

  it("com pageSize respeita a página pedida", async () => {
    mock._result = { data: [], error: null };
    await paymentGateway.listPayments({ ym: "2026-11", page: 3, pageSize: 20 });
    expect(calls("payments", "range")[0].args).toEqual([40, 59]);
  });

  it("calculates days_overdue for pending payments", async () => {
    const pastDate = "2024-01-01";
    mock._result = {
      data: [
        { id: "1", status: "pending", due_date: pastDate, amount: 100 },
      ],
      error: null,
    };
    const result = await paymentGateway.listPayments({ ym: "2024-01" });
    expect(result.rows[0].days_overdue).toBeGreaterThan(0);
  });

  it("sets days_overdue to 0 for paid payments", async () => {
    mock._result = {
      data: [
        { id: "1", status: "paid", due_date: "2024-01-01", amount: 100, paid_at: "2024-01-05" },
      ],
      error: null,
    };
    const result = await paymentGateway.listPayments({ ym: "2024-01" });
    expect(result.rows[0].days_overdue).toBe(0);
  });
});

describe("paymentGateway.markPaid", () => {
  it("throws when id is missing", async () => {
    await expect(paymentGateway.markPaid(null)).rejects.toThrow("obrigatório");
  });

  it("returns true on success", async () => {
    mock._result = { data: null, error: null };
    const result = await paymentGateway.markPaid("1");
    expect(result).toBe(true);
  });
});

describe("paymentGateway.cancelPayment", () => {
  it("throws when id is missing", async () => {
    await expect(paymentGateway.cancelPayment(null)).rejects.toThrow("obrigatório");
  });
});

describe("paymentGateway.reopenPayment", () => {
  it("throws when id is missing", async () => {
    await expect(paymentGateway.reopenPayment(null)).rejects.toThrow("obrigatório");
  });
});

describe("paymentGateway.bulkMarkPaid", () => {
  it("throws when ids is empty", async () => {
    await expect(paymentGateway.bulkMarkPaid([])).rejects.toThrow("obrigatória");
    await expect(paymentGateway.bulkMarkPaid(null as never)).rejects.toThrow("obrigatória");
  });

  it("returns succeeded ids when all calls pass", async () => {
    mock._result = { data: null, error: null };
    const result = await paymentGateway.bulkMarkPaid(["a", "b", "c"]);
    expect(result.succeeded.sort()).toEqual(["a", "b", "c"]);
    expect(result.failed).toHaveLength(0);
  });

  it("collects failures without throwing", async () => {
    let call = 0;
    mock.from.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      const methods = ["select", "insert", "update", "upsert", "delete", "eq", "neq", "in", "gte", "lte", "lt", "gt", "not", "ilike", "is", "order", "limit", "range", "single", "maybeSingle"];
      for (const m of methods) chain[m] = vi.fn(() => chain);
      chain.then = (resolve: (r: { data: unknown; error: unknown }) => unknown) => {
        call += 1;
        // 2nd call fails
        if (call === 2) return resolve({ data: null, error: { message: "fk error" } });
        return resolve({ data: null, error: null });
      };
      return chain;
    });
    const result = await paymentGateway.bulkMarkPaid(["a", "b"]);
    expect(result.succeeded).toContain("a");
    expect(result.failed[0]).toMatchObject({ id: "b" });
    expect(result.failed[0].error).toContain("fk error");
  });
});

describe("paymentGateway.bulkReopenPayments", () => {
  it("throws when ids is empty", async () => {
    await expect(paymentGateway.bulkReopenPayments([])).rejects.toThrow("obrigatória");
  });
});

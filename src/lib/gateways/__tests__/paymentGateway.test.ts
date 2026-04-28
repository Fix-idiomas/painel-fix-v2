import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./supabaseMock";

const mock = createSupabaseMock();
vi.mock("@/lib/supabaseClient", () => ({ supabase: mock }));

const { paymentGateway } = await import("../paymentGateway");

beforeEach(() => {
  vi.clearAllMocks();
  mock._result = { data: null, error: null };
});

describe("paymentGateway.previewGenerateMonth", () => {
  it("throws when ym is missing", async () => {
    await expect(paymentGateway.previewGenerateMonth({} as never)).rejects.toThrow("obrigatório");
  });

  it("filters students with zero value", async () => {
    mock._result = {
      data: [
        { id: "1", name: "João", monthly_value: 500, due_day: 10, payer_id: "p1" },
        { id: "2", name: "Maria", monthly_value: 0, due_day: 5, payer_id: null },
      ],
      error: null,
    };
    const result = await paymentGateway.previewGenerateMonth({ ym: "2024-03" });
    expect(result).toHaveLength(1);
    expect(result[0].student_id).toBe("1");
    expect(result[0].due_date).toBe("2024-03-10");
  });
});

describe("paymentGateway.listPayments", () => {
  it("throws when ym is missing", async () => {
    await expect(paymentGateway.listPayments({} as never)).rejects.toThrow("obrigatório");
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

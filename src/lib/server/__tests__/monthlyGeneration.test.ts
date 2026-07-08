// Fuso fixo para o guard de meio de mês (spDateOf usa America/Sao_Paulo, mas o
// created_at é comparado como data SP — pinamos para blindar a leitura de borda).
process.env.TZ = "America/Sao_Paulo";

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseMock } from "@/lib/gateways/__tests__/supabaseMock";

// monthlyGeneration usa o `admin` injetado, mas importa helpers → supabaseClient,
// que lança se as env vars não existirem. Mockamos o client para o import subir.
vi.mock("@/lib/supabaseClient", () => ({ supabase: createSupabaseMock() }));

const { generateMensalidadesForTenant } = await import("@/lib/server/monthlyGeneration");

const mock = createSupabaseMock();

beforeEach(() => {
  mock._result = { data: null, error: null };
  mock._tableResults = {};
  mock._rpcResults = {};
  mock._calls = [];
  mock._consumed = {};
});

const TENANT = "tenant-1";
const YM = "2026-07"; // monthStart = 2026-07-01

describe("generateMensalidadesForTenant — guard de meio de mês", () => {
  it("NÃO cobra aluno cadastrado depois do início do mês", async () => {
    mock._tableResults.students = {
      data: [
        {
          id: "a1",
          name: "Aluno Novo",
          monthly_value: 300,
          due_day: 5,
          payer_id: "p1",
          status: "ativo",
          created_at: "2026-07-15T12:00:00Z", // meio do mês
        },
      ],
      error: null,
    };
    const r = await generateMensalidadesForTenant(mock as never, TENANT, YM);
    expect(r).toEqual({ inserted: 0, skipped_existing: 0, created_payers: 0 });
    // nem chega a consultar payments (retorna antes por não haver candidatos)
    expect(mock._calls.some((c) => c.table === "payments")).toBe(false);
  });

  it("cobra aluno que já existia no início do mês", async () => {
    mock._tableResults.students = {
      data: [
        {
          id: "a1",
          name: "Aluno Antigo",
          monthly_value: 300,
          due_day: 5,
          payer_id: "p1",
          status: "ativo",
          created_at: "2026-06-20T12:00:00Z", // antes do mês
        },
      ],
      error: null,
    };
    mock._tableResults.payments = { data: [], error: null }; // sem lançamento existente + insert ok
    mock._tableResults.payers = { data: [{ id: "p1", name: "Pagador" }], error: null };

    const r = await generateMensalidadesForTenant(mock as never, TENANT, YM);
    expect(r.inserted).toBe(1);
    expect(r.created_payers).toBe(0);

    const insert = mock._calls.find((c) => c.table === "payments" && c.method === "insert");
    expect(insert).toBeTruthy();
    const rows = insert!.args[0] as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      tenant_id: TENANT,
      student_id: "a1",
      competence_month: "2026-07-01",
      amount: 300,
      status: "pending",
    });
  });
});

describe("generateMensalidadesForTenant — cancel-safety (cron diário)", () => {
  it("NÃO regera mensalidade se já existe lançamento do mês, mesmo cancelado", async () => {
    mock._tableResults.students = {
      data: [
        {
          id: "a1",
          name: "Aluno Antigo",
          monthly_value: 300,
          due_day: 5,
          payer_id: "p1",
          status: "ativo",
          created_at: "2026-06-20T12:00:00Z",
        },
      ],
      error: null,
    };
    // A existência por mês considera QUALQUER status (o índice único é parcial em
    // status <> 'canceled'). Uma mensalidade cancelada aparece aqui e bloqueia a
    // recriação diária — senão o cron "ressuscitaria" o cancelamento todo dia.
    mock._tableResults.payments = { data: [{ student_id: "a1" }], error: null };

    const r = await generateMensalidadesForTenant(mock as never, TENANT, YM);
    expect(r).toEqual({ inserted: 0, skipped_existing: 1, created_payers: 0 });
    // não deve inserir nada
    expect(mock._calls.some((c) => c.table === "payments" && c.method === "insert")).toBe(false);
  });

  it("ignora aluno com monthly_value <= 0", async () => {
    mock._tableResults.students = {
      data: [
        { id: "a1", name: "Bolsista", monthly_value: 0, due_day: 5, payer_id: "p1", status: "ativo", created_at: "2026-06-01T12:00:00Z" },
      ],
      error: null,
    };
    const r = await generateMensalidadesForTenant(mock as never, TENANT, YM);
    expect(r).toEqual({ inserted: 0, skipped_existing: 0, created_payers: 0 });
  });
});

describe("generateMensalidadesForTenant — conflito 23505 em lote (corrida cron × Prévia)", () => {
  it("faz fallback linha a linha e insere só as que não colidiram", async () => {
    mock._tableResults.students = {
      data: [
        { id: "a1", name: "Aluno 1", monthly_value: 300, due_day: 5, payer_id: "p1", status: "ativo", created_at: "2026-06-01T12:00:00Z" },
        { id: "a2", name: "Aluno 2", monthly_value: 200, due_day: 5, payer_id: "p2", status: "ativo", created_at: "2026-06-01T12:00:00Z" },
      ],
      error: null,
    };
    mock._tableResults.payers = { data: [{ id: "p1" }, { id: "p2" }], error: null };
    // Fila da tabela payments, na ordem em que o código consulta:
    //   1) select de existentes → vazio
    //   2) insert do LOTE → 23505 (o Postgres aborta o lote inteiro)
    //   3) insert linha a1 → ok
    //   4) insert linha a2 → 23505 (essa já existia; ignorada)
    mock._tableResults.payments = [
      { data: [], error: null },
      { data: null, error: { code: "23505" } },
      { data: null, error: null },
      { data: null, error: { code: "23505" } },
    ];

    const r = await generateMensalidadesForTenant(mock as never, TENANT, YM);
    expect(r.inserted).toBe(1);
    expect(r.skipped_existing).toBe(1); // 2 candidatos − 1 inserido
  });
});

describe("generateMensalidadesForTenant — vínculo de pagador", () => {
  it("cria um pagador quando o aluno não tem payer_id e vincula ao aluno", async () => {
    mock._tableResults.students = [
      { data: [{ id: "a1", name: "Aluno X", monthly_value: 300, due_day: 5, payer_id: null, status: "ativo", created_at: "2026-06-01T12:00:00Z" }], error: null },
      { data: null, error: null }, // update payer_id no aluno
    ];
    mock._tableResults.payers = [
      { data: [], error: null }, // lista de pagadores — vazia
      { data: { id: "pnew", name: "Aluno X" }, error: null }, // insert do novo pagador
    ];
    mock._tableResults.payments = [
      { data: [], error: null }, // existentes
      { data: null, error: null }, // insert do lote → ok
    ];

    const r = await generateMensalidadesForTenant(mock as never, TENANT, YM);
    expect(r.inserted).toBe(1);
    expect(r.created_payers).toBe(1);

    // criou pagador e a mensalidade aponta para ele
    expect(mock._calls.some((c) => c.table === "payers" && c.method === "insert")).toBe(true);
    const insert = mock._calls.find((c) => c.table === "payments" && c.method === "insert");
    const rows = insert!.args[0] as Array<Record<string, unknown>>;
    expect(rows[0].payer_id).toBe("pnew");
  });

  it("reusa pagador existente pelo NOME (case-insensitive), sem criar outro", async () => {
    mock._tableResults.students = [
      { data: [{ id: "a1", name: "Maria", monthly_value: 200, due_day: 5, payer_id: null, status: "ativo", created_at: "2026-06-01T12:00:00Z" }], error: null },
      { data: null, error: null }, // update payer_id
    ];
    mock._tableResults.payers = { data: [{ id: "pM", name: "Maria" }], error: null };
    mock._tableResults.payments = [
      { data: [], error: null },
      { data: null, error: null },
    ];

    const r = await generateMensalidadesForTenant(mock as never, TENANT, YM);
    expect(r.inserted).toBe(1);
    expect(r.created_payers).toBe(0);
    expect(mock._calls.some((c) => c.table === "payers" && c.method === "insert")).toBe(false);
    const insert = mock._calls.find((c) => c.table === "payments" && c.method === "insert");
    const rows = insert!.args[0] as Array<Record<string, unknown>>;
    expect(rows[0].payer_id).toBe("pM");
  });
});

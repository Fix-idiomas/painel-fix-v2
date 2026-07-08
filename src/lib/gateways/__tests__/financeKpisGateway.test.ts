import { describe, it, expect, vi, beforeEach } from "vitest";

// financeKpisGateway importa supabaseClient (lança sem env) e os sub-gateways.
// Mockamos tudo: getCombinedRevenueKpis só combina listPayments + listOtherRevenues.
vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));

const listPayments = vi.fn();
const listOtherRevenues = vi.fn();
vi.mock("../paymentGateway", () => ({ paymentGateway: { listPayments } }));
vi.mock("../otherRevenueGateway", () => ({ otherRevenueGateway: { listOtherRevenues } }));

const { financeKpisGateway } = await import("../financeKpisGateway");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("financeKpisGateway.getCombinedRevenueKpis", () => {
  it("retorna as chaves canônicas em inglês (contrato que /relatorios e /painel consomem)", async () => {
    listPayments.mockResolvedValue({ rows: [] });
    listOtherRevenues.mockResolvedValue({ rows: [] });
    const kpis = await financeKpisGateway.getCombinedRevenueKpis({ ym: "2026-07" });
    expect(Object.keys(kpis).sort()).toEqual(["overdue", "received", "total", "upcoming"]);
  });

  it("classifica received/overdue/upcoming por status e vencimento; total = soma", async () => {
    // Datas fixas nos extremos → comparação contra 'today' é determinística.
    listPayments.mockResolvedValue({
      rows: [
        { amount: 100, status: "paid", due_date: "2026-07-05" },
        { amount: 50, status: "pending", due_date: "2000-01-01" }, // muito atrasado
        { amount: 30, status: "pending", due_date: "2999-01-01" }, // muito futuro
        { amount: 999, status: "canceled", due_date: "2026-07-05" }, // ignorado
      ],
    });
    listOtherRevenues.mockResolvedValue({
      rows: [{ amount: 20, status: "paid", due_date: "2026-07-10" }],
    });

    const kpis = await financeKpisGateway.getCombinedRevenueKpis({ ym: "2026-07" });
    expect(kpis.received).toBe(120); // 100 + 20 (paid)
    expect(kpis.overdue).toBe(50); // pending + vencido
    expect(kpis.upcoming).toBe(30); // pending + a vencer
    expect(kpis.total).toBe(200); // 120 + 50 + 30 (cancelado fora)
  });

  it("combina mensalidades e outras receitas; tolera rows ausente", async () => {
    listPayments.mockResolvedValue({}); // sem rows
    listOtherRevenues.mockResolvedValue({ rows: [{ amount: 75, status: "paid", due_date: "2026-07-01" }] });
    const kpis = await financeKpisGateway.getCombinedRevenueKpis({ ym: "2026-07" });
    expect(kpis.received).toBe(75);
    expect(kpis.total).toBe(75);
  });
});

import { describe, it, expect } from "vitest";
import { readCombinedRevenue } from "@/lib/revenueKpis";

describe("readCombinedRevenue", () => {
  it("REGRESSÃO: a forma retornada por getCombinedRevenueKpis (chaves em inglês) produz gross != 0", () => {
    // Exatamente o shape de financeKpisGateway.getCombinedRevenueKpis. O bug era
    // ler recebido/a_receber/atrasado (pt-BR) → tudo 0 → gráfico/KPIs vazios.
    const kpis = { total: 200, received: 120, upcoming: 30, overdue: 50 };
    const v = readCombinedRevenue(kpis);
    expect(v.recebido).toBe(120);
    expect(v.aReceber).toBe(30);
    expect(v.atrasado).toBe(50);
    expect(v.gross).toBe(200);
    expect(v.gross).not.toBe(0);
  });

  it("aceita fallback pt-BR (rede de segurança)", () => {
    const v = readCombinedRevenue({ recebido: 10, a_receber: 5, atrasado: 2 } as never);
    expect(v).toEqual({ recebido: 10, aReceber: 5, atrasado: 2, gross: 17 });
  });

  it("chaves em inglês têm precedência sobre pt-BR se ambas existirem", () => {
    const v = readCombinedRevenue({ received: 100, recebido: 999 } as never);
    expect(v.recebido).toBe(100);
  });

  it("tolera null/undefined/parciais → 0", () => {
    expect(readCombinedRevenue(null)).toEqual({ recebido: 0, aReceber: 0, atrasado: 0, gross: 0 });
    expect(readCombinedRevenue(undefined)).toEqual({ recebido: 0, aReceber: 0, atrasado: 0, gross: 0 });
    expect(readCombinedRevenue({ received: 40 })).toEqual({ recebido: 40, aReceber: 0, atrasado: 0, gross: 40 });
  });

  it("gross = recebido + aReceber + atrasado", () => {
    const v = readCombinedRevenue({ received: 7, upcoming: 11, overdue: 13 });
    expect(v.gross).toBe(31);
  });
});

// Leitura das KPIs de receita combinada (financeKpisGateway.getCombinedRevenueKpis).
//
// A fonte retorna chaves em INGLÊS: { total, received, upcoming, overdue }. As
// telas históricas liam em pt-BR (recebido/a_receber/atrasado) — mismatch que
// zerava o gráfico de "Receita por mês" e os KPIs do painel. Este helper é o
// ponto único de leitura (com fallback pt-BR por robustez) e é coberto por teste,
// para que a regressão (voltar a ler a chave errada) quebre o CI.

export type CombinedRevenueLike =
  | {
      total?: number;
      received?: number;
      upcoming?: number;
      overdue?: number;
      // fallback pt-BR (a fonte atual NÃO emite estas chaves; rede de segurança)
      recebido?: number;
      a_receber?: number;
      atrasado?: number;
    }
  | null
  | undefined;

export interface RevenueView {
  recebido: number;
  aReceber: number;
  atrasado: number;
  /** receita bruta = recebido + a receber + atrasado */
  gross: number;
}

/** Normaliza as KPIs combinadas para os campos que a UI exibe. */
export function readCombinedRevenue(kpis: CombinedRevenueLike): RevenueView {
  const recebido = Number(kpis?.received ?? kpis?.recebido ?? 0);
  const aReceber = Number(kpis?.upcoming ?? kpis?.a_receber ?? 0);
  const atrasado = Number(kpis?.overdue ?? kpis?.atrasado ?? 0);
  return { recebido, aReceber, atrasado, gross: recebido + aReceber + atrasado };
}

import { isSameYm, todayISO } from "./dates";

export interface RevenueRow {
  status?: string | null;
  amount?: number | null;
  due_date?: string | null;
  competence_month?: string | null;
}

export interface RevenueKpisByDueDate {
  receita_prevista_mes: number;
  receita_a_receber: number;
  receita_atrasada: number;
  receita_recebida: number;
}

export interface RevenueKpisByCompetence {
  comp_receita_prevista_mes: number;
  comp_receita_realizada_mes: number;
  comp_diferenca_previsto_realizado: number;
}

type Policy = "due_date" | "competence" | "both";

interface ComputeOpts {
  ym: string;
  tz?: string;
  policy?: Policy;
}

export function computeRevenueKPIs(
  rows: RevenueRow[] | null | undefined,
  { ym, tz = "America/Sao_Paulo", policy = "due_date" }: ComputeOpts,
): RevenueKpisByDueDate | RevenueKpisByCompetence | {
  by_due: RevenueKpisByDueDate;
  by_competence: RevenueKpisByCompetence;
} {
  const clean = (rows ?? []).filter(Boolean) as RevenueRow[];

  if (policy === "due_date") return computeByDueDate(clean, ym, tz);
  if (policy === "competence") return computeByCompetence(clean, ym);
  if (policy === "both") {
    return {
      by_due: computeByDueDate(clean, ym, tz),
      by_competence: computeByCompetence(clean, ym),
    };
  }
  return computeByDueDate(clean, ym, tz);
}

function computeByDueDate(rows: RevenueRow[], ym: string, tz: string): RevenueKpisByDueDate {
  const today = todayISO(tz);
  let prevista = 0;
  let aReceber = 0;
  let atrasada = 0;
  let recebida = 0;

  for (const r of rows) {
    if (!r || r.status === "canceled") continue;
    const inMonthByDue = isSameYm(r.due_date, ym);

    if (r.status === "pending" && inMonthByDue) {
      const amt = r.amount ?? 0;
      prevista += amt;
      if (r.due_date && today && r.due_date < today) atrasada += amt;
      else aReceber += amt;
    }

    if (r.status === "paid" && inMonthByDue) {
      recebida += r.amount ?? 0;
    }
  }

  return {
    receita_prevista_mes: prevista,
    receita_a_receber: aReceber,
    receita_atrasada: atrasada,
    receita_recebida: recebida,
  };
}

function computeByCompetence(rows: RevenueRow[], ym: string): RevenueKpisByCompetence {
  let previsto = 0;
  let realizado = 0;

  for (const r of rows) {
    if (!r || r.status === "canceled") continue;
    const inMonthByComp = r.competence_month && r.competence_month.startsWith(ym);

    if (inMonthByComp) {
      if (r.status === "pending" || r.status === "paid") {
        previsto += r.amount ?? 0;
      }
      if (r.status === "paid") {
        realizado += r.amount ?? 0;
      }
    }
  }

  return {
    comp_receita_prevista_mes: previsto,
    comp_receita_realizada_mes: realizado,
    comp_diferenca_previsto_realizado: previsto - realizado,
  };
}

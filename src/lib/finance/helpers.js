import { isSameYm, todayISO } from "./dates.js";
import { isOverdue } from "./status.js";

/**
 * policy: "due_date" | "competence" | "both"
 * ym: "YYYY-MM" (mês-alvo)
 */
export function computeRevenueKPIs(rows, { ym, tz = "America/Sao_Paulo", policy = "due_date" } = {}) {
  const clean = (rows ?? []).filter(Boolean);

  if (policy === "due_date") {
    return computeByDueDate(clean, ym, tz);
  }
  if (policy === "competence") {
    return computeByCompetence(clean, ym);
  }
  if (policy === "both") {
    return {
      by_due: computeByDueDate(clean, ym, tz),
      by_competence: computeByCompetence(clean, ym),
    };
  }
  return computeByDueDate(clean, ym, tz);
}

function computeByDueDate(rows, ym, tz) {
  const today = todayISO(tz);
  let prevista = 0;
  let aReceber = 0;
  let atrasada = 0;
  let recebida = 0;

  for (const r of rows) {
    if (!r || r.status === "canceled") continue;
    const inMonthByDue = isSameYm(r.due_date, ym);

    if (r.status === "pending" && inMonthByDue) {
      prevista += r.amount ?? 0;
      if (r.due_date && r.due_date < today) atrasada += r.amount ?? 0;
      else aReceber += r.amount ?? 0;
    }

    if (r.status === "paid" && r.paid_at && isSameYm(r.paid_at, ym)) {
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

function computeByCompetence(rows, ym) {
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
        // realizado é alocado ao mês de competência, não ao paid_at
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

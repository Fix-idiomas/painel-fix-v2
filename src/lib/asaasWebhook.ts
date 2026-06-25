// src/lib/asaasWebhook.ts
// Lógica PURA do webhook Asaas (sem IO/Next/Supabase) — testável isoladamente.
// Usada por src/app/api/webhooks/asaas/route.ts.

type Dict = Record<string, unknown>;

// Soma N meses a uma data YYYY-MM-DD, fazendo CLAMP no último dia do mês destino
// (evita overflow: 2026-01-31 + 1 = 2026-02-28, não 2026-03-03).
export function addMonthsISO(ymd: string, n: number): string {
  const [Y, M, D] = String(ymd).slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(Y, (M - 1) + n, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(D, lastDay));
  return target.toISOString().slice(0, 10);
}

// Normaliza um campo que pode vir como string (id) ou objeto expandido ({id}).
export function normalizeRef(x: unknown): string | null {
  if (!x) return null;
  if (typeof x === "string") return x;
  if (typeof x === "object" && typeof (x as Dict).id === "string") {
    return (x as Dict).id as string;
  }
  return null;
}

export function mapBillingType(bt: unknown): string | null {
  if (bt === "CREDIT_CARD") return "credit_card";
  if (bt === "PIX") return "pix";
  if (bt === "BOLETO") return "boleto";
  return null;
}

// Patch de status a partir do evento Asaas (ou null = ignorar).
// Transições idempotentes (setam valor absoluto). Omite payment_method quando
// não vier billingType, para não sobrescrever o valor já gravado.
export function transition(event: string, payment: Dict | null): Dict | null {
  switch (event) {
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED": {
      const due = payment?.dueDate ? String(payment.dueDate).slice(0, 10) : null;
      const method = mapBillingType(payment?.billingType);
      const patch: Dict = {
        status: "active",
        current_period_start: due,
        // cobre até o próximo ciclo; o cron usa current_period_end < now (backstop)
        current_period_end: due ? addMonthsISO(due, 1) : null,
      };
      if (method) patch.payment_method = method;
      return patch;
    }
    case "PAYMENT_OVERDUE":
      return { status: "past_due" };
    case "PAYMENT_REFUNDED":
    case "PAYMENT_CHARGEBACK_REQUESTED":
    case "PAYMENT_CHARGEBACK_DISPUTE":
      return { status: "past_due" };
    case "SUBSCRIPTION_DELETED":
    case "SUBSCRIPTION_INACTIVATED":
      return { status: "canceled" };
    default:
      return null;
  }
}

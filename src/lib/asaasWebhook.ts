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

// Como mapear o evento → linha de subscriptions (auditoria C4).
// - Evento COM id de assinatura → só pela assinatura. Se não bater com a atual do
//   tenant, o evento é de uma assinatura ANTIGA/ÓRFÃ (cancelada pelo subscribe ou
//   pelo reconcile) e deve ser IGNORADO — antes caía no fallback por customer (o
//   mesmo do tenant) e um SUBSCRIPTION_DELETED da órfã cancelava o pagante.
// - Evento SEM id de assinatura (cobrança avulsa) → fallback por customer.
export function mappingStrategy(asaasSubId: string | null, asaasCustId: string | null):
  "subscription" | "customer" | "none" {
  if (asaasSubId) return "subscription";
  if (asaasCustId) return "customer";
  return "none";
}

const PAYMENT_STATUS_EVENTS = new Set([
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_OVERDUE",
]);

// Evento de cobrança de um período ANTERIOR ao vigente (auditoria M10)?
// Ex.: no cartão, o PAYMENT_RECEIVED (liquidação) chega ~30 dias após o
// CONFIRMED — já depois da confirmação do mês seguinte. Aplicá-lo faria
// current_period_end "voltar" um mês (e o cron expiraria um pagante); um OVERDUE
// atrasado de cobrança antiga rebaixaria quem já pagou a atual.
// Estornos/chargebacks NÃO entram aqui: valem mesmo para cobranças antigas.
export function isStalePaymentEvent(
  event: string,
  payment: Dict | null,
  currentPeriodStart: string | null | undefined
): boolean {
  if (!PAYMENT_STATUS_EVENTS.has(event)) return false;
  const due = payment?.dueDate ? String(payment.dueDate).slice(0, 10) : null;
  const cur = currentPeriodStart ? String(currentPeriodStart).slice(0, 10) : null;
  if (!due || !cur) return false;
  return due < cur;
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

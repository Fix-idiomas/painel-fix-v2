// Lógica pura de entitlement — sem React, sem IO. Testável isoladamente.
// Decide se o tenant tem direito de acesso ao app a partir do claim "subscription".
//
// Regra (PRD-1):
//   - billing_exempt = true          → sempre liberado (isenção vitalícia)
//   - status = 'active'              → liberado
//   - status = 'trial' e não vencido → liberado (avaliado por data)
//   - caso contrário                 → bloqueado

/**
 * @param {{status?:string, billing_exempt?:boolean, trial_end?:string|null}|null} sub
 * @param {number} [now] epoch ms — injetável para testes; default Date.now()
 * @returns {boolean}
 */
export function hasEntitlement(sub, now = Date.now()) {
  if (!sub) return false;
  if (sub.billing_exempt) return true;
  if (sub.status === "active") return true;
  if (sub.status === "trial") {
    if (!sub.trial_end) return true;
    return new Date(sub.trial_end).getTime() >= now;
  }
  return false;
}

const GRACE_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Nível de acesso tri-estado (espelha tenant_access_level do banco):
 * 'full' | 'readonly' (carência) | 'blocked'.
 * @param {{status?:string,billing_exempt?:boolean,trial_end?:string|null,current_period_end?:string|null}|null} sub
 * @param {number} [now]
 */
export function accessLevel(sub, now = Date.now()) {
  if (!sub) return "blocked";
  if (sub.billing_exempt) return "full";
  if (sub.status === "active") return "full";
  if (sub.status === "trial" && (!sub.trial_end || new Date(sub.trial_end).getTime() >= now)) {
    return "full";
  }
  const ref = sub.trial_end || sub.current_period_end;
  if (ref && new Date(ref).getTime() >= now - GRACE_DAYS * DAY_MS) return "readonly";
  return "blocked";
}

/** Dias restantes do trial (ou null se não estiver em trial com data). */
export function trialDaysLeft(sub, now = Date.now()) {
  if (!sub || sub.status !== "trial" || !sub.trial_end) return null;
  return Math.ceil((new Date(sub.trial_end).getTime() - now) / DAY_MS);
}

/**
 * Aviso para o banner global de billing (ou null se nada a avisar).
 * @returns {{tone:'warning'|'danger', text:string, cta:string, href:string}|null}
 */
export function billingNotice(sub, now = Date.now()) {
  if (!sub || sub.billing_exempt) return null;
  if (sub.status === "past_due") {
    return { tone: "danger", text: "Pagamento da assinatura pendente. Regularize para manter o acesso.", cta: "Regularizar", href: "/assinatura" };
  }
  if (accessLevel(sub, now) === "readonly") {
    return { tone: "warning", text: "Acesso em modo leitura. Regularize o pagamento para voltar a operar.", cta: "Regularizar", href: "/assinatura" };
  }
  if (sub.status === "trial") {
    const d = trialDaysLeft(sub, now);
    if (d !== null && d >= 0 && d <= 3) {
      return { tone: "warning", text: `Seu teste termina em ${d} dia${d === 1 ? "" : "s"}. Assine para não perder o acesso.`, cta: "Assinar agora", href: "/assinatura" };
    }
  }
  return null;
}

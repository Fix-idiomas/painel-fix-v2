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

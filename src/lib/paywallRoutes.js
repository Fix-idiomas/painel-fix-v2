// Rotas sempre acessíveis mesmo SEM entitlement (paywall). Lógica pura, testável.
// (Auth e /onboarding já ficam fora do grupo (app), então não passam pelo guard.)

export const ALLOWLIST = ["/assinatura", "/conta"];

/**
 * @param {string} pathname caminho atual (sem query string)
 * @returns {boolean} true se a rota é liberada mesmo sem assinatura ativa.
 *
 * Subrotas de itens da allowlist (ex.: "/conta/x") são liberadas POR DESIGN.
 * Ao adicionar uma subrota SENSÍVEL sob "/conta" ou "/assinatura", reavalie
 * esta regra (ela não deve expor dados que exijam entitlement).
 */
export function isAllowed(pathname) {
  if (typeof pathname !== "string") return false;
  return ALLOWLIST.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

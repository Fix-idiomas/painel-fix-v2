// src/lib/subscriptionReconcile.ts
// TD-2 — Lógica PURA da reconciliação de assinaturas órfãs na Asaas.
// Sem IO/HTTP: recebe as assinaturas da Asaas de um tenant + o id que o NOSSO
// banco considera a verdade (subscriptions.asaas_subscription_id) e decide o que
// cancelar. Conservador por design: só cancela "extras" quando a assinatura
// verdadeira é CONFIRMADA entre as ativas; caso ambíguo → revisão manual, nunca
// cancela (uma ação de cobrança não pode derrubar a assinatura legítima).

export interface AsaasSubLite {
  id: string;
  deleted: boolean;
  status: string;
}

export interface ReconcilePlan {
  /** ids de assinaturas órfãs a cancelar (extras, com a verdadeira confirmada). */
  cancelIds: string[];
  /** true quando a situação é ambígua e exige olho humano (não cancelar nada). */
  review: boolean;
  reason: string;
}

/**
 * @param subs  assinaturas da Asaas do tenant (não-deletadas e deletadas)
 * @param storedId  asaas_subscription_id que o nosso banco tem (ou null)
 */
export function reconcilePlan(
  subs: AsaasSubLite[],
  storedId: string | null
): ReconcilePlan {
  const active = (subs || []).filter((s) => s && !s.deleted);

  // Nada ativo na Asaas → nada a fazer.
  if (active.length === 0) {
    return { cancelIds: [], review: false, reason: "sem assinaturas ativas na Asaas" };
  }

  // Caminho seguro: a assinatura verdadeira (storedId) está entre as ativas →
  // qualquer OUTRA ativa é órfã (extra) e pode ser cancelada com segurança.
  if (storedId && active.some((s) => s.id === storedId)) {
    const cancelIds = active.filter((s) => s.id !== storedId).map((s) => s.id);
    return {
      cancelIds,
      review: false,
      reason: cancelIds.length ? `${cancelIds.length} órfã(s) com a verdadeira confirmada` : "só a verdadeira ativa",
    };
  }

  // Ambíguo: storedId nulo OU não está entre as ativas. Pode ser uma órfã de
  // timeout (criada antes de persistir) OU a única assinatura legítima com o
  // banco dessincronizado. NÃO cancelar — sinalizar p/ revisão manual.
  return {
    cancelIds: [],
    review: true,
    reason: storedId
      ? `id do banco (${storedId}) não está entre as ${active.length} ativa(s) na Asaas`
      : `banco sem id e ${active.length} assinatura(s) ativa(s) na Asaas`,
  };
}

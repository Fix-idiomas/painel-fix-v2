// Regras de datas da cobrança da assinatura (crons). Lógica pura, testável.
//
// Linha do tempo de um atraso (dia 0 = current_period_end):
//   dia 0      vencimento — pagante que paga hoje NÃO é afetado
//   dia 1      Asaas costuma enviar PAYMENT_OVERDUE → past_due (webhook é a fonte)
//   dia 3      backstop: o cron expire-subscriptions marca past_due se o webhook se perdeu
//   dias 1,3,6 aviso por e-mail ao dono (subscription-dunning)
//   dia 7+     fim da carência somente-leitura → bloqueado (tenant_access_level)

const DAY_MS = 86_400_000;

/** Dias de folga antes do cron marcar active → past_due (backstop do webhook). */
export const EXPIRE_GRACE_DAYS = 3;

/** Dias de atraso em que o dono recebe aviso (o 7º dia é o bloqueio). */
export const DUNNING_DAYS: readonly number[] = [1, 3, 6];

/** Carência somente-leitura (espelha tenant_access_level / entitlement.js). */
export const READONLY_GRACE_DAYS = 7;

/** Instante (ISO) antes do qual um período vencido vira past_due no cron. */
export function pastDueCutoffIso(now: number = Date.now()): string {
  return new Date(now - EXPIRE_GRACE_DAYS * DAY_MS).toISOString();
}

/** Dias inteiros desde o fim do período (null se data ausente/inválida). */
export function daysOverdue(periodEnd: string | null | undefined, now: number = Date.now()): number | null {
  if (!periodEnd) return null;
  const t = new Date(periodEnd).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now - t) / DAY_MS);
}

/** Envia o aviso hoje? Só nos dias de DUNNING_DAYS (evita e-mail diário). */
export function shouldSendDunning(periodEnd: string | null | undefined, now: number = Date.now()): boolean {
  const d = daysOverdue(periodEnd, now);
  return d !== null && DUNNING_DAYS.includes(d);
}

/** Data (pt-BR) em que o acesso será bloqueado, para o texto do aviso. */
export function blockDateBR(periodEnd: string | null | undefined): string | null {
  if (!periodEnd) return null;
  const t = new Date(periodEnd).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + READONLY_GRACE_DAYS * DAY_MS).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

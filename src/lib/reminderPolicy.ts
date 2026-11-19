// Regras puras do lembrete automático de mensalidade em atraso
// (cron /api/cron/dunning-reminders). Sem IO — testável isoladamente.
//
// Auditoria A7: antes o cron reenviava o MESMO lembrete todo dia, para sempre.
// Agora cada mensalidade recebe no máximo MAX_REMINDERS lembretes automáticos,
// espaçados por REMINDER_INTERVAL_DAYS. O histórico vem de finance_reminders_log
// (status 'sent'), que também registra os lembretes manuais da tela de
// Mensalidades — um envio manual conta e adia o próximo automático.

import { accessLevel } from "@/lib/entitlement";

export const REMINDER_INTERVAL_DAYS = 7;
export const MAX_REMINDERS = 3;

const DAY_MS = 86_400_000;

// "YYYY-MM-DD" no fuso de São Paulo.
export function spDateOf(input: string | number | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(input));
  const g = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

// Dias inteiros entre duas datas "YYYY-MM-DD" (b - a). Aritmética em UTC puro,
// sem fuso: as strings já são datas de calendário.
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export type ReminderHistory = { sentCount: number; lastSentAt: string | null };

// Deve enviar lembrete hoje para esta mensalidade?
//   - precisa estar vencida (ao menos 1 dia de atraso);
//   - no máximo MAX_REMINDERS envios bem-sucedidos;
//   - ao menos REMINDER_INTERVAL_DAYS desde o último envio (dias de calendário SP).
export function shouldRemind(
  dueDate: string,
  history: ReminderHistory | null | undefined,
  today: string
): boolean {
  if (!dueDate || daysBetween(dueDate.slice(0, 10), today) < 1) return false;
  const count = history?.sentCount ?? 0;
  if (count >= MAX_REMINDERS) return false;
  if (!history?.lastSentAt) return true;
  return daysBetween(spDateOf(history.lastSentAt), today) >= REMINDER_INTERVAL_DAYS;
}

// Só escolas com acesso pleno disparam e-mail automático (mesma regra da rota
// /api/send-mail, que exige tenant_can_write). Escola com assinatura vencida ou
// cancelada não manda cobrança em nome dela.
export function tenantCanSendReminders(
  sub: Parameters<typeof accessLevel>[0],
  now: number = Date.now()
): boolean {
  return accessLevel(sub, now) === "full";
}

// Escapa texto para interpolar em HTML (nomes vêm do cadastro). Auditoria B3.
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

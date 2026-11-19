// Validação pura do payload de e-mail enviado por usuários (rota /api/send-mail).
// Sem IO — testável isoladamente. Limites anti-abuso: a rota só é acessível a
// admin/financeiro, mas ainda assim não deve virar disparador em massa.

import type { MailgunInput } from "@/lib/mailgun";

export const MAX_RECIPIENTS = 10;
export const MAX_SUBJECT_CHARS = 200;
export const MAX_BODY_CHARS = 100_000;

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

// Tipo "achatado" (campos opcionais) — narrowing de união discriminada não é
// confiável neste projeto (tsconfig strict:false). Mesmo padrão de AsaasResult.
export type MailCheck = {
  ok: boolean;
  payload?: { to: string[]; subject: string; html?: string; text?: string };
  error?: string;
};

export function validateMailPayload(body: Partial<MailgunInput> | null | undefined): MailCheck {
  if (!body || typeof body !== "object") return { ok: false, error: "Corpo inválido." };

  const rawTo = Array.isArray(body.to) ? body.to : String(body.to ?? "").split(",");
  const to = [...new Set(rawTo.map((s) => String(s).trim().toLowerCase()).filter(Boolean))];
  const subject = String(body.subject ?? "").trim();
  const html = typeof body.html === "string" && body.html.trim() ? body.html : undefined;
  const text = typeof body.text === "string" && body.text.trim() ? body.text : undefined;

  if (to.length === 0 || !subject || (!html && !text)) {
    return { ok: false, error: "Campos obrigatórios: destinatário, assunto e mensagem." };
  }
  if (to.length > MAX_RECIPIENTS) {
    return { ok: false, error: `Máximo de ${MAX_RECIPIENTS} destinatários por envio.` };
  }
  const invalid = to.find((e) => !EMAIL_RE.test(e));
  if (invalid) return { ok: false, error: `E-mail inválido: ${invalid}` };
  if (subject.length > MAX_SUBJECT_CHARS) {
    return { ok: false, error: `Assunto muito longo (máx. ${MAX_SUBJECT_CHARS} caracteres).` };
  }
  if ((html?.length ?? 0) > MAX_BODY_CHARS || (text?.length ?? 0) > MAX_BODY_CHARS) {
    return { ok: false, error: "Mensagem muito longa." };
  }

  return { ok: true, payload: { to, subject, html, text } };
}

// Shared Mailgun sender used by /api/send-mail (user-authenticated)
// and /api/cron/dunning-reminders (server-to-server).

export type MailgunInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  fromName?: string | null;
};

export type MailgunResult = {
  ok: boolean;
  id?: string;
  status?: number;
  error?: string;
};

export async function sendMailgun({ to, subject, html, text, fromName }: MailgunInput): Promise<MailgunResult> {
  if (!to || !subject || (!html && !text)) {
    return { ok: false, status: 400, error: "Campos obrigatórios: to, subject e html ou text" };
  }

  const API_KEY = process.env.MAILGUN_API_KEY;
  const DOMAIN = process.env.MAILGUN_DOMAIN;
  const DEFAULT_FROM = process.env.MAILGUN_FROM || `Fix Idiomas <no-reply@${DOMAIN}>`;

  if (!API_KEY || !DOMAIN) {
    return { ok: false, status: 500, error: "Config de Mailgun ausente (env vars)" };
  }

  const addrMatch = DEFAULT_FROM.match(/<([^>]+)>/);
  const addr = addrMatch ? addrMatch[1] : `no-reply@${DOMAIN}`;
  const FROM = fromName ? `${fromName} <${addr}>` : DEFAULT_FROM;

  const recipients = Array.isArray(to)
    ? to
    : String(to).split(",").map((s) => s.trim()).filter(Boolean);

  const form = new URLSearchParams();
  form.set("from", FROM);
  form.set("to", recipients.join(","));
  form.set("subject", subject);
  if (html) form.set("html", html);
  if (text) form.set("text", text);

  const res = await fetch(`https://api.mailgun.net/v3/${DOMAIN}/messages`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + (typeof btoa === "function"
        ? btoa(`api:${API_KEY}`)
        : Buffer.from(`api:${API_KEY}`).toString("base64")),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const detail = await res.text();
    return { ok: false, status: 502, error: `Falha Mailgun: ${detail}` };
  }

  const data = await res.json();
  return { ok: true, id: data.id };
}

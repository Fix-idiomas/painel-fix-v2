// Server Route: /api/admin/update-user-perms  (Next.js App Router)
// NOTE: apesar do path, o handler atual contém a lógica antiga de envio de
// e-mail (Mailgun). Provável código morto/duplicado — manter até validar.
import type { NextRequest } from "next/server";

type SendMailBody = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
};

export async function POST(req: NextRequest) {
  try {
    const { to, subject, html, text } = (await req.json()) as SendMailBody;

    if (!to || !subject || (!html && !text)) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: to, subject e html ou text" }),
        { status: 400 }
      );
    }

    const API_KEY = process.env.MAILGUN_API_KEY;
    const DOMAIN  = process.env.MAILGUN_DOMAIN;   // ex: "mg.seudominio.com"
    const FROM    = process.env.MAILGUN_FROM || `Fix Idiomas <no-reply@${DOMAIN}>`;

    if (!API_KEY || !DOMAIN) {
      return new Response(
        JSON.stringify({ error: "Config de Mailgun ausente (env vars)" }),
        { status: 500 }
      );
    }

    // aceita string "a@b,c@d" ou array
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
        Authorization: "Basic " + btoa(`api:${API_KEY}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    if (!res.ok) {
      const msg = await res.text();
      return new Response(
        JSON.stringify({ error: "Falha Mailgun", detail: msg }),
        { status: 502 }
      );
    }

    const data = await res.json();
    return new Response(JSON.stringify({ ok: true, id: data.id }), { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}

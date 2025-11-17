// src/app/api/send-mail/route.js
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req) {
  try {
    const { to, subject, html, text } = await req.json();

    if (!to || !subject || (!html && !text)) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: to, subject e html ou text" }), { status: 400 });
    }

    const API_KEY = process.env.MAILGUN_API_KEY;
    const DOMAIN  = process.env.MAILGUN_DOMAIN;   // ex: "mg.seudominio.com"
    const DEFAULT_FROM = process.env.MAILGUN_FROM || `Fix Idiomas <no-reply@${DOMAIN}>`;

    if (!API_KEY || !DOMAIN) {
      return new Response(JSON.stringify({ error: "Config de Mailgun ausente (env vars)" }), { status: 500 });
    }

    // Tenta descobrir o brand do tenant atual (quando houver sessão)
    let fromName = null;
    try {
      const supabase = createRouteHandlerClient({ cookies });
      const { data: tenantId } = await supabase.rpc("current_tenant_id");
      if (tenantId) {
        const { data: settings } = await supabase.rpc("get_tenant_settings");
        const name = String(settings?.brand_name || "").trim();
        if (name) fromName = name;
      }
    } catch { /* mantém o DEFAULT_FROM */ }

    // Mantém o endereço do FROM (entre <...>) e troca apenas o nome, se disponível
    const addrMatch = DEFAULT_FROM.match(/<([^>]+)>/);
    const addr = addrMatch ? addrMatch[1] : `no-reply@${DOMAIN}`;
    const FROM = fromName ? `${fromName} <${addr}>` : DEFAULT_FROM;

    // aceita string "a@b,c@d" ou array
    const recipients = Array.isArray(to)
      ? to
      : String(to).split(",").map(s => s.trim()).filter(Boolean);

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
      const msg = await res.text();
      return new Response(JSON.stringify({ error: "Falha Mailgun", detail: msg }), { status: 502 });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ ok: true, id: data.id }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 500 });
  }
}

// Server Route: /api/send-mail  (Next.js App Router)
export async function POST(req) {
  try {
    const body = await req.json();
    const { to, subject, html, text } = body;

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

    // ---------------------------------------------
    // [log] Registro opcional em finance_reminders_log
    // Só tenta logar se vier tenant_id no body (para obedecer RLS).
    // Campos opcionais aceitos: payment_id, student_id, payer_id, meta, provider.
    // Qualquer erro aqui é ignorado para não quebrar o fluxo de envio.
    // ---------------------------------------------
    (async () => {
      try {
        const {
          tenant_id,
          payment_id = null,
          student_id = null,
          payer_id = null,
          meta = null,
          provider = "mailgun",
        } = body || {};

        if (!tenant_id) return; // sem tenant_id não há como passar pelas RLS de INSERT

        // tenta usar um client server-side seu; se não existir, cai fora silenciosamente
        let supabase = null;
        try {
          // ajuste o caminho abaixo se o seu helper tiver outro nome/local
          const mod = await import("@/lib/supabaseServer");
          // exemplos possíveis:
          // const { supabase } = mod;               // se exporta uma instância
          // const { supabaseServer } = mod;         // se exporta uma factory
          // supabase = mod.supabase ?? mod.supabaseServer?.();
          supabase = mod.supabase ?? (typeof mod.supabaseServer === "function" ? mod.supabaseServer() : null);
        } catch { /* sem client server, não loga */ }

        // fallback: tentar um client padrão; se for anon e sem sessão server, deve falhar na policy — o erro é ignorado
        if (!supabase) {
          try {
            const mod2 = await import("@/lib/supabaseClient");
            supabase = mod2.supabase ?? null;
          } catch { /* ignora */ }
        }

        if (!supabase) return;

        await supabase.from("finance_reminders_log").insert({
          tenant_id,
          payment_id,
          student_id,
          payer_id,
          to_email: recipients.join(","),
          subject,
          provider,
          status: "sent",
          error_text: null,
          meta: {
            ...(meta || {}),
            mailgun_id: data?.id ?? null,
          },
          // sent_at default now()
        });
      } catch {
        // não deixa o log falhar o request principal
      }
    })();
    // ---------------------------------------------

    return new Response(JSON.stringify({ ok: true, id: data.id }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 500 });
  }
}

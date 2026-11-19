// src/app/api/send-mail/route.ts
// Envio de e-mail pelo Mailgun em nome da escola (alias = brand_name).
//
// Autorização (antes: qualquer usuário logado enviava qualquer e-mail → relay):
//   1. sessão válida;
//   2. tenant vinculado (current_tenant_id);
//   3. permissão is_admin_or_finance_write no tenant (lembretes de mensalidade e
//      "Enviar e-mail" do painel são ações de admin/financeiro);
//   4. assinatura com escrita liberada (tenant_can_write) — tenant bloqueado ou em
//      modo leitura não dispara e-mails.
// Limites anti-abuso: nº de destinatários e tamanho do corpo/assunto.
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { NextRequest } from "next/server";
import { sendMailgun, type MailgunInput } from "@/lib/mailgun";
import { validateMailPayload } from "@/lib/mailPolicy";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  try {
    // Next 15: cookies() é async. Aguardamos e passamos como factory sync.
    // Cast necessário pois @supabase/auth-helpers-nextjs@0.10.x ainda
    // tipa a factory como retorno síncrono (compat Next 14).
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({
      cookies: (() => cookieStore) as unknown as typeof cookies,
    });
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return json({ error: "Não autenticado." }, 401);

    const { data: tenantId, error: tErr } = await supabase.rpc("current_tenant_id");
    if (tErr) throw tErr;
    if (!tenantId) return json({ error: "Tenant não identificado." }, 403);

    const [{ data: canSend, error: pErr }, { data: canWrite, error: wErr }] = await Promise.all([
      supabase.rpc("is_admin_or_finance_write", { p_tenant: tenantId }),
      supabase.rpc("tenant_can_write"),
    ]);
    if (pErr) throw pErr;
    if (wErr) throw wErr;
    if (!canSend) return json({ error: "Sem permissão para enviar e-mails." }, 403);
    if (!canWrite) {
      return json({ error: "Assinatura sem acesso de escrita. Regularize para enviar e-mails." }, 403);
    }

    const body = (await req.json().catch(() => null)) as MailgunInput | null;
    const check = validateMailPayload(body);
    if (!check.ok) return json({ error: check.error }, 400);

    // Alias do remetente = brand_name do tenant atual (fallback: DEFAULT_FROM).
    let fromName: string | null = null;
    try {
      const { data: settings } = await supabase.rpc("get_tenant_settings");
      const name = String(settings?.brand_name || "").trim();
      if (name) fromName = name;
    } catch { /* usa DEFAULT_FROM */ }

    const result = await sendMailgun({ ...check.payload, fromName });
    if (result.ok) return json({ ok: true, id: result.id });
    return json({ error: result.error ?? "Erro ao enviar e-mail." }, result.status ?? 500);
  } catch (e) {
    console.error("[send-mail] error", e instanceof Error ? e.message : String(e));
    return json({ error: "Não foi possível enviar o e-mail. Tente novamente." }, 500);
  }
}

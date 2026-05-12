// src/app/api/send-mail/route.ts
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { NextRequest } from "next/server";
import { sendMailgun, type MailgunInput } from "@/lib/mailgun";

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
    if (!session) {
      return new Response(JSON.stringify({ error: "Não autenticado." }), { status: 401 });
    }

    const body = (await req.json()) as MailgunInput;

    // Descobre o brand do tenant atual, se houver
    let fromName: string | null = null;
    try {
      const { data: tenantId } = await supabase.rpc("current_tenant_id");
      if (tenantId) {
        const { data: settings } = await supabase.rpc("get_tenant_settings");
        const name = String(settings?.brand_name || "").trim();
        if (name) fromName = name;
      }
    } catch { /* usa DEFAULT_FROM */ }

    const result = await sendMailgun({ ...body, fromName });
    if (result.ok) {
      return new Response(JSON.stringify({ ok: true, id: result.id }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: result.error ?? "Erro ao enviar e-mail." }), { status: result.status ?? 500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
}

// src/app/api/billing/cancel/route.ts
// POST — cancela a assinatura do tenant na Asaas.
// Auth: sessão (cookies) + permissão owner/admin via RPC is_admin_or_owner.
// Lê o asaas_subscription_id e atualiza status via service role.

import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { cancelSubscription } from "@/lib/asaas";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({
      cookies: (() => cookieStore) as unknown as typeof cookies,
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return json({ error: "Não autenticado." }, 401);

    const { data: tenantId, error: tErr } = await supabase.rpc("current_tenant_id");
    if (tErr) throw tErr;
    if (!tenantId) return json({ error: "Tenant não identificado." }, 403);

    const { data: canManage, error: pErr } = await supabase.rpc("is_admin_or_owner", {
      p_tenant: tenantId,
    });
    if (pErr) throw pErr;
    if (!canManage) return json({ error: "Sem permissão para gerenciar a assinatura." }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: row, error: selErr } = await admin
      .from("subscriptions")
      .select("asaas_subscription_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row?.asaas_subscription_id) {
      return json({ error: "Nenhuma assinatura para cancelar." }, 400);
    }

    const res = await cancelSubscription(row.asaas_subscription_id);
    if (!res.ok) return json({ error: `Asaas (cancelar): ${res.error}` }, 502);

    const { error: upErr } = await admin
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("tenant_id", tenantId);
    if (upErr) throw upErr;

    console.log("[billing:cancel] ok", { tenant: tenantId, sub: row.asaas_subscription_id });
    return json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[billing:cancel] error", msg);
    return json({ error: msg }, 500);
  }
}

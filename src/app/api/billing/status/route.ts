// src/app/api/billing/status/route.ts
// GET — detalhes de cobrança do tenant para a aba "Plano e cobrança".
// Auth: sessão (cookies) + permissão owner/admin via RPC is_admin_or_owner.
// Lê a linha de subscriptions via SERVICE ROLE — evita o deadlock das policies
// RESTRICTIVE (C1): um tenant bloqueado não consegue ler a própria tabela, mas
// PRECISA ver o billing para regularizar. O status/datas o cliente já tem pelo
// claim (JWT); aqui devolvemos o que o claim não carrega (ex.: payment_method).
// Nunca trafega dado de cartão (não armazenamos PAN — PCI SAQ-A).

import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET() {
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
    if (!canManage) return json({ error: "Sem permissão para ver a assinatura." }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: row, error: selErr } = await admin
      .from("subscriptions")
      .select(
        "plan, status, billing_exempt, payment_method, trial_end, current_period_end, asaas_subscription_id"
      )
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (selErr) throw selErr;

    if (!row) return json({ subscription: null });

    // Não expõe ids internos da Asaas ao cliente; só sinaliza se há assinatura lá.
    return json({
      subscription: {
        plan: row.plan,
        status: row.status,
        billing_exempt: row.billing_exempt,
        payment_method: row.payment_method,
        trial_end: row.trial_end,
        current_period_end: row.current_period_end,
        has_asaas_subscription: !!row.asaas_subscription_id,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[billing:status] error", msg);
    return json({ error: msg }, 500);
  }
}

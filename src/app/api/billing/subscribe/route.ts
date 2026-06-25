// src/app/api/billing/subscribe/route.ts
// POST — cria/recupera o customer na Asaas e abre a assinatura (cartão ou Pix).
// Auth: sessão (cookies) + permissão owner/admin via RPC is_admin_or_owner.
// O status só vira 'active' quando o webhook confirmar o pagamento (fonte da
// verdade). Aqui apenas persistimos asaas_customer_id/asaas_subscription_id.
// Escrita em subscriptions via service role (cliente não tem policy de escrita).

import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import {
  getOrCreateCustomer,
  createSubscription,
  cancelSubscription,
  type AsaasMethod,
} from "@/lib/asaas";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// Placeholder até a definição de produto (preço mensal). Ajustar via env.
const PLAN_VALUE = Number(process.env.PLAN_MONTHLY_BRL || "49.9");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
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

    const body = (await req.json().catch(() => ({}))) as {
      method?: string;
      cpfCnpj?: string;
      name?: string;
      creditCardToken?: string;
    };
    const method: AsaasMethod = body?.method === "pix" ? "pix" : "credit_card";
    const cpfCnpj = String(body?.cpfCnpj || "").replace(/\D/g, ""); // CPF ou CNPJ (só dígitos)
    const name = String(body?.name || "").trim() || session.user.email || "Cliente";
    const creditCardToken = body?.creditCardToken ? String(body.creditCardToken) : undefined;
    if (!cpfCnpj) return json({ error: "CPF/CNPJ é obrigatório." }, 400);
    if (method === "credit_card" && !creditCardToken) {
      return json({ error: "Token do cartão é obrigatório para pagamento no cartão." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Evita assinatura órfã: cancela uma anterior (não cancelada) antes de criar.
    const { data: existing } = await admin
      .from("subscriptions")
      .select("asaas_subscription_id, status")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (existing?.asaas_subscription_id && existing.status !== "canceled") {
      await cancelSubscription(existing.asaas_subscription_id); // best-effort
    }

    const cust = await getOrCreateCustomer({
      name,
      email: session.user.email ?? undefined,
      cpfCnpj,
      tenantId,
    });
    if (!cust.ok) return json({ error: `Asaas (cliente): ${cust.error}` }, 502);

    const sub = await createSubscription({
      customerId: cust.data!.id,
      method,
      value: PLAN_VALUE,
      nextDueDate: todayISO(),
      tenantId,
      description: "Assinatura Painel Fix",
      creditCardToken,
    });
    if (!sub.ok) return json({ error: `Asaas (assinatura): ${sub.error}` }, 502);

    // Persiste os ids (status só muda via webhook PAYMENT_CONFIRMED).
    const { error: upErr } = await admin
      .from("subscriptions")
      .update({
        asaas_customer_id: cust.data!.id,
        asaas_subscription_id: sub.data!.id,
        payment_method: method,
      })
      .eq("tenant_id", tenantId);
    if (upErr) throw upErr;

    console.log("[billing:subscribe] ok", { tenant: tenantId, method, sub: sub.data.id });
    return json({ ok: true, subscriptionId: sub.data.id, status: sub.data.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[billing:subscribe] error", msg);
    return json({ error: msg }, 500);
  }
}

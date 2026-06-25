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
  getSubscriptionFirstPayment,
  getPaymentPixQrCode,
  type AsaasMethod,
} from "@/lib/asaas";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// Placeholder até a definição de produto (preço mensal). Ajustar via env.
const PLAN_VALUE = Number(process.env.PLAN_MONTHLY_BRL || "49.9");

// Os dois loops de retry (1ª cobrança + QR Pix) são sequenciais e podem somar
// alguns segundos em rede lenta — folga de tempo p/ não cortar no meio.
export const maxDuration = 30;

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
    if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
      return json({ error: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)." }, 400);
    }
    // Fluxo de checkout HOSPEDADO: o usuário paga (cartão ou Pix) na página da
    // Asaas, então não recebemos dados de cartão aqui (sem token necessário).

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: existing } = await admin
      .from("subscriptions")
      .select("asaas_subscription_id, status")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    // Quem já está ativo gerencia em Conta → Plano e cobrança (não reassina aqui).
    if (existing?.status === "active") {
      return json({ error: "Você já tem uma assinatura ativa. Gerencie em Conta → Plano e cobrança." }, 409);
    }
    const oldSubId = existing?.asaas_subscription_id || null;
    // TODO(TD-1, go-live): reassinatura concorrente (trial/past_due/canceled) não
    // é idempotente — 2 cliques quase simultâneos podem criar 2 assinaturas Asaas
    // (uma vira órfã). Impacto atual zero (contas isentas + webhook = verdade +
    // botão desabilitado). Tratar com índice único parcial no banco. Ver docs/TECH_DEBT.md.

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
    if (upErr) {
      // A assinatura já existe na Asaas mas não foi persistida aqui → compensa
      // cancelando para não deixar cobrança órfã, e loga o id p/ reconciliação.
      console.error("[billing:subscribe] persist failed — compensating", {
        tenant: tenantId, sub: sub.data!.id, err: upErr.message,
      });
      try { await cancelSubscription(sub.data!.id); } catch { /* best-effort */ }
      throw upErr;
    }

    // Só DEPOIS de a nova existir e estar persistida, cancela a anterior órfã
    // (evita janela em que o tenant fica sem assinatura). Best-effort.
    if (oldSubId && oldSubId !== sub.data!.id) {
      await cancelSubscription(oldSubId);
    }

    // 1ª cobrança da assinatura — pode levar um instante p/ a Asaas gerar.
    // Guardamos o paymentId p/ buscar o QR Pix; invoiceUrl é o checkout hospedado
    // (usado p/ cartão e como fallback do Pix).
    let checkoutUrl: string | null = null;
    let firstPaymentId: string | null = null;
    for (let i = 0; i < 3 && !checkoutUrl; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 800));
      const fp = await getSubscriptionFirstPayment(sub.data.id);
      if (fp.ok) {
        if (fp.data?.id) firstPaymentId = fp.data.id;
        if (fp.data?.invoiceUrl) checkoutUrl = fp.data.invoiceUrl;
      }
    }

    // Pix INLINE: busca o QR Code (imagem + copia-e-cola) p/ exibir no app, sem
    // abrir o checkout hospedado. Best-effort — se falhar, o cliente cai no
    // invoiceUrl (checkout hospedado) como fallback.
    let pix: { encodedImage: string; payload: string; expirationDate: string | null } | null = null;
    if (method === "pix" && firstPaymentId) {
      for (let i = 0; i < 3 && !pix; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 800));
        const qr = await getPaymentPixQrCode(firstPaymentId);
        if (qr.ok && qr.data) pix = qr.data;
      }
    }

    console.log("[billing:subscribe] ok", {
      tenant: tenantId, method, sub: sub.data.id, checkout: !!checkoutUrl, pix: !!pix,
    });
    // Não expõe o id interno da assinatura Asaas ao cliente (menor privilégio);
    // a UI usa apenas checkoutUrl (cartão) e pix (inline).
    return json({ ok: true, status: sub.data.status, checkoutUrl, pix });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[billing:subscribe] error", msg);
    // Mensagem genérica ao cliente (não vaza detalhe interno de Postgres/driver).
    return json({ error: "Não foi possível processar a assinatura. Tente novamente." }, 500);
  }
}

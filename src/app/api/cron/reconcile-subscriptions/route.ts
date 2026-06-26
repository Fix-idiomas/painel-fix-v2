// src/app/api/cron/reconcile-subscriptions/route.ts
//
// TD-2 — Cron de reconciliação de assinaturas órfãs na Asaas.
// Varre os tenants que já interagiram com a Asaas e cancela assinaturas "extras"
// (criadas mas nunca persistidas — ex.: timeout serverless entre criar e gravar
// o id), que de outra forma cobrariam o cliente em duplicidade. Conservador: só
// cancela quando a assinatura verdadeira (subscriptions.asaas_subscription_id)
// está confirmada entre as ativas; casos ambíguos são apenas LOGADOS p/ revisão.
//
// Pula tenants com checkout em andamento (claim recente) para nunca cancelar uma
// assinatura legítima ainda não persistida. Proteção: Bearer ${CRON_SECRET}.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { listSubscriptions, cancelSubscription } from "@/lib/asaas";
import { reconcilePlan } from "@/lib/subscriptionReconcile";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Pula tenants cujo checkout começou há menos disto (evita corrida com um
// subscribe em andamento que ainda não persistiu o id). >> maxDuration(30s)+90s.
const RECENT_CHECKOUT_MS = 5 * 60 * 1000;

export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!secret || !header || !safeEqual(header, `Bearer ${secret}`)) {
    console.warn("[cron:reconcile-subscriptions] unauthorized", { hasHeader: !!header });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("[cron:reconcile-subscriptions] misconfigured (service role ausente)");
    return NextResponse.json({ error: "Config ausente." }, { status: 500 });
  }

  try {
    console.log("[cron:reconcile-subscriptions] start");
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Só tenants que já criaram customer na Asaas. Este filtro TAMBÉM é
    // anti-corrida: a 1ª assinatura só fica visível ao cron depois que o
    // customer é persistido — antes disso não há o que reconciliar.
    // SEGURANÇA: o cancelamento depende inteiramente do conservadorismo do
    // reconcilePlan (nunca cancela quando a verdadeira não está confirmada). O
    // skip por checkout_claim_at abaixo é defesa secundária, não a principal.
    const { data: rows, error } = await supabase
      .from("subscriptions")
      .select("tenant_id, asaas_subscription_id, checkout_claim_at")
      .not("asaas_customer_id", "is", null);
    if (error) throw error;

    const now = Date.now();
    let scanned = 0, skipped = 0, canceled = 0, failed = 0, review = 0;

    for (const row of rows || []) {
      // Checkout em andamento → não mexe (a assinatura nova pode ainda não estar persistida).
      const claimAt = row.checkout_claim_at ? new Date(row.checkout_claim_at).getTime() : 0;
      if (claimAt && now - claimAt < RECENT_CHECKOUT_MS) { skipped++; continue; }

      scanned++;
      const list = await listSubscriptions(row.tenant_id);
      if (!list.ok) {
        failed++;
        console.error("[cron:reconcile-subscriptions] list falhou", { tenant: row.tenant_id, err: list.error });
        continue;
      }

      const plan = reconcilePlan(list.data || [], row.asaas_subscription_id || null);
      if (plan.review) {
        review++;
        console.warn("[cron:reconcile-subscriptions] revisão manual", { tenant: row.tenant_id, reason: plan.reason });
        continue;
      }
      for (const id of plan.cancelIds) {
        const res = await cancelSubscription(id);
        if (res.ok) {
          canceled++;
          console.log("[cron:reconcile-subscriptions] órfã cancelada", { tenant: row.tenant_id, sub: id });
        } else {
          failed++;
          console.error("[cron:reconcile-subscriptions] cancel falhou", { tenant: row.tenant_id, sub: id, err: res.error });
        }
      }
    }

    const log = failed > 0 || review > 0 ? console.warn : console.log;
    log("[cron:reconcile-subscriptions] done", { scanned, skipped, canceled, failed, review });
    return NextResponse.json({ ok: true, scanned, skipped, canceled, failed, review });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron:reconcile-subscriptions] error", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

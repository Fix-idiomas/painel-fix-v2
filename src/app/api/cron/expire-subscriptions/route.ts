// src/app/api/cron/expire-subscriptions/route.ts
//
// Cron diário (vercel.json) — backstop autoritativo das transições de
// assinatura por DATA, cobrindo a defasagem (~1h) do claim no JWT e webhooks
// perdidos. Roda server-to-server com service role (varredura cross-tenant).
//
// Transições (apenas linhas NÃO isentas — billing_exempt = false):
//   - trial  com trial_end           < now → expired
//   - active com current_period_end  < now → past_due
//
// Proteção: header `Authorization: Bearer ${CRON_SECRET}` (igual aos demais crons).

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Comparação de tempo constante (evita timing attack na checagem do secret).
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!secret || !header || !safeEqual(header, `Bearer ${secret}`)) {
    console.warn("[cron:expire-subscriptions] unauthorized", { hasHeader: !!header });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("[cron:expire-subscriptions] misconfigured (service role ausente)");
    return NextResponse.json(
      { error: "Supabase não configurado (service role)." },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const nowIso = new Date().toISOString();
    console.log("[cron:expire-subscriptions] start", { ran_at: nowIso });

    // 1) Trials vencidos → expired
    const { data: expiredTrials, error: e1 } = await supabase
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("status", "trial")
      .eq("billing_exempt", false)
      .lt("trial_end", nowIso)
      .select("id");
    if (e1) throw e1;

    // 2) Assinaturas ativas vencidas sem renovação → past_due
    // NOTA: linhas com current_period_end NULL são ignoradas (NULL < now → NULL),
    // o que é intencional. Esse campo só é populado quando há cobrança real
    // (webhook do PRD-2); até lá, esta transição fica efetivamente inerte.
    const { data: pastDue, error: e2 } = await supabase
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("status", "active")
      .eq("billing_exempt", false)
      .lt("current_period_end", nowIso)
      .select("id");
    if (e2) throw e2;

    const trials_expired = expiredTrials?.length ?? 0;
    const marked_past_due = pastDue?.length ?? 0;
    console.log("[cron:expire-subscriptions] done", {
      ran_at: nowIso,
      trials_expired,
      marked_past_due,
    });
    return NextResponse.json({ ok: true, ran_at: nowIso, trials_expired, marked_past_due });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron:expire-subscriptions] error", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

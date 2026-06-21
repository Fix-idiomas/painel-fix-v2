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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
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
    const { data: pastDue, error: e2 } = await supabase
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("status", "active")
      .eq("billing_exempt", false)
      .lt("current_period_end", nowIso)
      .select("id");
    if (e2) throw e2;

    return NextResponse.json({
      ok: true,
      ran_at: nowIso,
      trials_expired: expiredTrials?.length ?? 0,
      marked_past_due: pastDue?.length ?? 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

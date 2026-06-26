// src/app/api/cron/monthly-previa/route.ts
//
// Cron mensal (vercel.json, dia 01) que gera os lançamentos do mês para TODAS as
// escolas: mensalidades, gastos recorrentes e outras receitas recorrentes.
//
// MULTI-TENANT server-to-server: usa SERVICE ROLE (bypassa RLS) e itera os
// tenants, gerando com tenant_id EXPLÍCITO (src/lib/server/monthlyGeneration).
// NÃO usa o financeGateway (client anon, dependente de sessão) — esse caminho só
// vale no browser, no botão "Prévia" (1 escola por vez), que segue intacto.
//
// Idempotente: re-rodar não duplica (pula competence_month já existente).
// Proteção: header Authorization: Bearer ${CRON_SECRET} (comparação constante).

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import {
  generateMensalidadesForTenant,
  generateExpensesForTenant,
  ensureOtherRevenuesForTenant,
} from "@/lib/server/monthlyGeneration";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const maxDuration = 120;

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
    console.warn("[cron:monthly-previa] unauthorized", { hasHeader: !!header });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("[cron:monthly-previa] misconfigured (service role ausente)");
    return NextResponse.json({ error: "Config ausente." }, { status: 500 });
  }

  const ym = new Date().toISOString().slice(0, 7);
  try {
    console.log("[cron:monthly-previa] start", { ym });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: tenants, error } = await admin.from("tenants").select("id, name");
    if (error) throw error;

    const totals = { mensalidades: 0, gastos: 0, outras_receitas: 0 };
    const perTenant: Array<{ tenant_id: string; ok: boolean; error?: string }> = [];

    for (const t of tenants || []) {
      try {
        // Sequencial por tenant: a geração de mensalidades pode criar/vincular
        // pagadores; manter ordem previsível e isolar falhas por escola.
        const mens = await generateMensalidadesForTenant(admin, t.id, ym);
        const gastos = await generateExpensesForTenant(admin, t.id, ym);
        const outras = await ensureOtherRevenuesForTenant(admin, t.id, ym);

        totals.mensalidades += mens.inserted;
        totals.gastos += gastos;
        totals.outras_receitas += outras.created || 0;
        perTenant.push({ tenant_id: t.id, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[cron:monthly-previa] tenant falhou", { tenant: t.id, err: msg });
        perTenant.push({ tenant_id: t.id, ok: false, error: msg });
      }
    }

    const failed = perTenant.filter((r) => !r.ok).length;
    const summary = { ym, tenants: perTenant.length, failed, ...totals };
    const log = failed > 0 ? console.error : console.log;
    log("[cron:monthly-previa] done", summary);

    return NextResponse.json({ ok: failed === 0, ...summary }, { status: failed ? 207 : 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron:monthly-previa] error", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

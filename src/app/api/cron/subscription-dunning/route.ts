// src/app/api/cron/subscription-dunning/route.ts
//
// Cron diário (vercel.json) — avisa o OWNER de tenants com assinatura em atraso
// (status=past_due, billing_exempt=false) para regularizar. Reusa o padrão do
// dunning-reminders (service role + Mailgun). O retry de cartão da Asaas cobre a
// inadimplência involuntária; este e-mail cobre o caso Pix e cartão sem renovar.
//
// Proteção: header Authorization: Bearer ${CRON_SECRET} (comparação constante).

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { sendMailgun } from "@/lib/mailgun";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = process.env.APP_URL || "";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

type OwnerRow = {
  tenant_id: string;
  brand_name: string | null;
  owner_email: string | null;
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!secret || !header || !safeEqual(header, `Bearer ${secret}`)) {
    console.warn("[cron:subscription-dunning] unauthorized", { hasHeader: !!header });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("[cron:subscription-dunning] misconfigured (service role ausente)");
    return NextResponse.json({ error: "Config ausente." }, { status: 500 });
  }

  try {
    console.log("[cron:subscription-dunning] start");
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Tenants em atraso (não isentos) + e-mail do owner + marca.
    const { data: rows, error } = await supabase.rpc("subscription_dunning_targets");
    if (error) throw error;

    const targets = (rows || []) as OwnerRow[];
    const results: Array<{ tenant_id: string; ok: boolean }> = [];

    for (const r of targets) {
      const to = r.owner_email?.trim();
      if (!to) {
        results.push({ tenant_id: r.tenant_id, ok: false });
        continue;
      }
      const brand = (r.brand_name || "sua escola").trim();
      const link = APP_URL ? `${APP_URL}/assinatura` : "o painel (menu Assinatura)";
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937">
          <p>Olá,</p>
          <p>Não conseguimos confirmar o pagamento da assinatura de <b>${brand}</b>.</p>
          <p>Pode ter sido limite, validade do cartão ou um erro temporário.
             Atualize a forma de pagamento para manter o acesso sem interrupção:</p>
          <p><a href="${link}">${link}</a></p>
          <p>Se já regularizou, desconsidere este aviso.</p>
          <p>Atenciosamente,<br/><b>${brand}</b></p>
        </div>`;
      const sent = await sendMailgun({
        to,
        subject: `Pagamento da assinatura pendente — ${brand}`,
        html,
        fromName: brand,
      });
      results.push({ tenant_id: r.tenant_id, ok: sent.ok });
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;
    const log = failed > 0 ? console.error : console.log;
    log("[cron:subscription-dunning] done", { targets: targets.length, sent, failed });
    return NextResponse.json({ ok: true, targets: targets.length, sent, failed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron:subscription-dunning] error", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

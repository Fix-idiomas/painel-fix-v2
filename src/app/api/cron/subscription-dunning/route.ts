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
import { shouldSendDunning, blockDateBR } from "@/lib/billingSchedule";

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
  current_period_end: string | null; // migration 20261119
};

// Escapa texto para interpolar em HTML (brand_name vem do tenant). Auditoria B3.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
    const now = Date.now();
    let skipped = 0;

    for (const r of targets) {
      // Avisos espaçados (dias 1, 3 e 6 de atraso) — antes saía TODO dia. C3.
      if (!shouldSendDunning(r.current_period_end, now)) {
        skipped++;
        continue;
      }
      const to = r.owner_email?.trim();
      if (!to) {
        results.push({ tenant_id: r.tenant_id, ok: false });
        continue;
      }
      const brandRaw = (r.brand_name || "sua escola").trim();
      const brand = esc(brandRaw);
      const link = APP_URL ? `${APP_URL}/assinatura` : "";
      const linkHtml = link
        ? `<p><a href="${esc(link)}">${esc(link)}</a></p>`
        : `<p>Acesse o painel, menu <b>Assinatura</b>.</p>`;
      const blockOn = blockDateBR(r.current_period_end);
      // Texto neutro: vale para Pix e cartão (antes falava em "validade do
      // cartão" também para quem paga com Pix).
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937">
          <p>Olá,</p>
          <p>Ainda não identificamos o pagamento da assinatura de <b>${brand}</b>.</p>
          <p>Enquanto isso, o painel fica em <b>modo somente leitura</b>${
            blockOn ? ` e o acesso será bloqueado em <b>${esc(blockOn)}</b>` : ""
          }. Para regularizar:</p>
          ${linkHtml}
          <p>Se já pagou, desconsidere este aviso — a confirmação pode levar alguns minutos.</p>
        </div>`;
      const sent = await sendMailgun({
        to,
        subject: `Pagamento da assinatura pendente — ${brandRaw}`,
        html,
        // Remetente fixo (marca do produto): o aviso é do sistema para a escola,
        // não da escola para alguém. Antes usava a própria marca da escola.
        fromName: null,
      });
      results.push({ tenant_id: r.tenant_id, ok: sent.ok });
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;
    const log = failed > 0 ? console.error : console.log;
    log("[cron:subscription-dunning] done", { targets: targets.length, skipped, sent, failed });
    return NextResponse.json({ ok: true, targets: targets.length, skipped, sent, failed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron:subscription-dunning] error", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

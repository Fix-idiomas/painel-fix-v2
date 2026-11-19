// src/app/api/cron/dunning-reminders/route.ts
//
// Cron diário (configurado no vercel.json) para enviar lembretes de
// mensalidades em atraso para os pagadores.
//
// Particularidades multi-tenant:
//   - Cada pagamento pertence a um tenant. O alias do remetente é o
//     `brand_name` do tenant correspondente (cada escola aparece com seu
//     próprio nome no campo "De:" do e-mail).
//   - Usa Supabase Service Role pra varrer todos os tenants sem depender
//     de RLS (cron roda server-to-server, sem sessão de usuário).
//
// Regras de envio (auditoria A7 — ver src/lib/reminderPolicy.ts):
//   - cada mensalidade recebe no máximo MAX_REMINDERS lembretes automáticos,
//     espaçados por REMINDER_INTERVAL_DAYS (antes: todo dia, para sempre);
//   - todo envio (ok ou falha) é registrado em finance_reminders_log — é esse
//     histórico que evita a repetição; lembretes manuais da tela também contam;
//   - só escolas com acesso pleno à assinatura disparam;
//   - "hoje" no fuso de São Paulo; sem o corte de 1000 linhas do PostgREST.
//
// Proteção: requer header `Authorization: Bearer ${CRON_SECRET}` (comparação constante).

import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { sendMailgun } from "@/lib/mailgun";
import { isValidEmail } from "@/lib/mailPolicy";
import {
  shouldRemind,
  spDateOf,
  daysBetween,
  tenantCanSendReminders,
  escapeHtml,
  MAX_REMINDERS,
  type ReminderHistory,
} from "@/lib/reminderPolicy";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const maxDuration = 120;

const PAGE = 1000; // limite padrão do PostgREST por requisição
const IN_CHUNK = 200; // ids por filtro .in() (evita URL gigante)

type OverduePayment = {
  id: string;
  tenant_id: string;
  payer_id: string;
  student_id: string | null;
  due_date: string;
  amount: number;
  student_name_snapshot: string | null;
  days_overdue: number;
};

type Payer = { id: string; name: string | null; email: string | null };

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function fmtBRL(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "YYYY-MM-DD" → "DD/MM/YYYY" sem passar por Date (evita deslocamento de fuso).
function fmtDateBR(s: string): string {
  const [y, m, d] = s.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : s;
}

// Lê TODAS as linhas de uma consulta, página a página (sem o corte de 1000).
async function fetchAll<T>(
  build: (_from: number, _to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
}

// Consulta com .in() em lotes de ids.
async function fetchIn<T>(
  ids: string[],
  build: (_ids: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  for (const part of chunks(ids, IN_CHUNK)) {
    const { data, error } = await build(part);
    if (error) throw error;
    all.push(...(data || []));
  }
  return all;
}

async function loadHistory(supabase: SupabaseClient, paymentIds: string[]) {
  type LogRow = { payment_id: string | null; sent_at: string | null };
  const rows = await fetchIn<LogRow>(paymentIds, (part) =>
    supabase
      .from("finance_reminders_log")
      .select("payment_id, sent_at")
      .eq("status", "sent")
      .in("payment_id", part)
  );
  const byPayment = new Map<string, ReminderHistory>();
  for (const r of rows) {
    if (!r.payment_id) continue;
    const h = byPayment.get(r.payment_id) || { sentCount: 0, lastSentAt: null };
    h.sentCount += 1;
    if (r.sent_at && (!h.lastSentAt || r.sent_at > h.lastSentAt)) h.lastSentAt = r.sent_at;
    byPayment.set(r.payment_id, h);
  }
  return byPayment;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!secret || !header || !safeEqual(header, `Bearer ${secret}`)) {
    console.warn("[cron:dunning-reminders] unauthorized", { hasHeader: !!header });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return NextResponse.json({ error: "Supabase não configurado (service role)." }, { status: 500 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const nowMs = Date.now();
    const today = spDateOf(nowMs);
    console.log("[cron:dunning-reminders] start", { today });

    // 1) Pendentes vencidas, de todos os tenants, paginado.
    type PaymentSelect = {
      id: string;
      tenant_id: string | null;
      payer_id: string | null;
      student_id: string | null;
      due_date: string | null;
      amount: number | string | null;
      student_name_snapshot: string | null;
    };
    const pendingRaw = await fetchAll<PaymentSelect>((from, to) =>
      supabase
        .from("payments")
        .select("id, tenant_id, payer_id, student_id, due_date, amount, student_name_snapshot")
        .eq("status", "pending")
        .lt("due_date", today)
        .order("id")
        .range(from, to)
    );

    let overdue: OverduePayment[] = pendingRaw
      .filter((p) => !!p.tenant_id && !!p.due_date && !!p.payer_id)
      .map((p) => {
        const due = String(p.due_date).slice(0, 10);
        return {
          id: p.id,
          tenant_id: p.tenant_id as string,
          payer_id: p.payer_id as string,
          student_id: p.student_id,
          due_date: due,
          amount: Number(p.amount ?? 0),
          student_name_snapshot: p.student_name_snapshot,
          days_overdue: daysBetween(due, today),
        };
      })
      .filter((p) => p.days_overdue > 0);

    const summary = { today, overdue: overdue.length, tenants_skipped: 0, not_due_yet: 0, no_email: 0 };

    // 2) Só escolas com acesso pleno (assinatura ativa, trial vigente ou isenta).
    const tenantIds = [...new Set(overdue.map((o) => o.tenant_id))];
    type SubRow = {
      tenant_id: string;
      status: string;
      billing_exempt: boolean;
      trial_end: string | null;
      current_period_end: string | null;
    };
    const subs = await fetchIn<SubRow>(tenantIds, (part) =>
      supabase
        .from("subscriptions")
        .select("tenant_id, status, billing_exempt, trial_end, current_period_end")
        .in("tenant_id", part)
    );
    const subByTenant = new Map(subs.map((s) => [s.tenant_id, s]));
    const allowedTenants = new Set(
      tenantIds.filter((t) => tenantCanSendReminders(subByTenant.get(t) ?? null, nowMs))
    );
    summary.tenants_skipped = tenantIds.length - allowedTenants.size;
    overdue = overdue.filter((o) => allowedTenants.has(o.tenant_id));

    // 3) Histórico de envios → só quem está "na vez" (máx. MAX_REMINDERS, espaçados).
    const history = await loadHistory(supabase, overdue.map((o) => o.id));
    const due = overdue.filter((o) => shouldRemind(o.due_date, history.get(o.id), today));
    summary.not_due_yet = overdue.length - due.length;

    if (due.length === 0) {
      console.log("[cron:dunning-reminders] done", { ...summary, sent: 0 });
      return NextResponse.json({ ok: true, sent: 0, failed: 0, ...summary });
    }

    // 4) Pagadores + marca da escola.
    const payerIds = [...new Set(due.map((o) => o.payer_id))];
    const dueTenants = [...new Set(due.map((o) => o.tenant_id))];
    const [payersData, tsData] = await Promise.all([
      fetchIn<Payer>(payerIds, (part) => supabase.from("payers").select("id, name, email").in("id", part)),
      fetchIn<{ tenant_id: string; brand_name: string | null }>(dueTenants, (part) =>
        supabase.from("tenant_settings").select("tenant_id, brand_name").in("tenant_id", part)
      ),
    ]);
    const payerById = new Map(payersData.map((p) => [p.id, p]));
    const brandByTenant = new Map<string, string>();
    for (const t of tsData) {
      const name = String(t.brand_name || "").trim();
      if (t.tenant_id && name) brandByTenant.set(t.tenant_id, name);
    }

    // 5) Agrupa por (tenant, pagador) com e-mail VÁLIDO → 1 e-mail por grupo.
    const groups = new Map<string, OverduePayment[]>();
    for (const o of due) {
      const email = payerById.get(o.payer_id)?.email?.trim();
      if (!email || !isValidEmail(email)) {
        summary.no_email += 1;
        continue;
      }
      const key = `${o.tenant_id}::${o.payer_id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(o);
    }

    // 6) Envia e registra cada mensalidade no log (é o log que evita repetir).
    let sent = 0;
    let failed = 0;
    const failures: Array<{ tenant_id: string; payer_id: string; detail: string | null }> = [];

    for (const [key, items] of groups.entries()) {
      const [tenant_id, payer_id] = key.split("::");
      const payer = payerById.get(payer_id)!;
      const to = payer.email!.trim();
      const brandName = brandByTenant.get(tenant_id) || null;
      const senderLabel = brandName || "Sua escola";

      const tableRows = items
        .map(
          (r) => `
          <tr>
            <td style="padding:6px 8px;border:1px solid #eee">${escapeHtml(r.student_name_snapshot || "Aluno")}</td>
            <td style="padding:6px 8px;border:1px solid #eee">${fmtDateBR(r.due_date)}</td>
            <td style="padding:6px 8px;border:1px solid #eee">${fmtBRL(r.amount)}</td>
            <td style="padding:6px 8px;border:1px solid #eee">${r.days_overdue} dia(s)</td>
          </tr>`
        )
        .join("");

      const subject = `Lembrete: mensalidade(s) em atraso · ${senderLabel}`;
      // Texto sem "referente ao mês atual": o atraso pode ser de qualquer mês —
      // a tabela mostra o vencimento de cada uma.
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#1f2937;">
          <p>Olá ${escapeHtml(payer.name || "Responsável")},</p>
          <p>Identificamos mensalidade(s) em atraso:</p>
          <table style="border-collapse:collapse; width:100%; max-width:640px; margin:12px 0;">
            <thead>
              <tr style="background:#f8fafc">
                <th style="text-align:left;padding:6px 8px;border:1px solid #eee">Aluno</th>
                <th style="text-align:left;padding:6px 8px;border:1px solid #eee">Vencimento</th>
                <th style="text-align:left;padding:6px 8px;border:1px solid #eee">Valor</th>
                <th style="text-align:left;padding:6px 8px;border:1px solid #eee">Atraso</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <p>Se já realizou o pagamento, por favor, desconsidere este lembrete.</p>
          <p>Qualquer dúvida, estamos à disposição.</p>
          <p>Atenciosamente,<br/><b>${escapeHtml(senderLabel)}</b></p>
        </div>
      `;

      const r = await sendMailgun({ to, subject, html, fromName: brandName });
      const sentAt = new Date().toISOString();
      if (r.ok) sent += 1;
      else {
        failed += 1;
        failures.push({ tenant_id, payer_id, detail: r.error ?? null });
      }

      const { error: logErr } = await supabase.from("finance_reminders_log").insert(
        items.map((it) => ({
          tenant_id,
          payment_id: it.id,
          student_id: it.student_id,
          payer_id,
          to_email: to,
          subject,
          provider: "mailgun",
          status: r.ok ? "sent" : "failed", // check constraint: sent|failed
          error_text: r.ok ? null : r.error ?? "Falha no provedor de e-mail",
          sent_at: sentAt,
          meta: { source: "cron", days_overdue: it.days_overdue, max_reminders: MAX_REMINDERS },
        }))
      );
      if (logErr) {
        // Sem log, o próximo cron reenviaria tudo → interrompe para não virar spam.
        console.error("[cron:dunning-reminders] log insert failed — abortando", {
          tenant_id,
          payer_id,
          message: logErr.message,
        });
        return NextResponse.json(
          { ok: false, error: "Falha ao registrar envio; execução interrompida.", sent, failed, ...summary },
          { status: 500 }
        );
      }
    }

    const logDone = failed > 0 ? console.error : console.log;
    logDone(`[cron:dunning-reminders] ${failed > 0 ? "done with failures" : "done"}`, {
      ...summary,
      sent,
      failed,
    });
    // Detalhe por falha SEM PII (sem o e-mail 'to').
    if (failures.length) console.error("[cron:dunning-reminders] failures", failures);
    return NextResponse.json({ ok: true, sent, failed, ...summary });
  } catch (err) {
    console.error("[cron:dunning-reminders] error", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Erro interno no envio de lembretes." }, { status: 500 });
  }
}

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
// Proteção: requer header `Authorization: Bearer ${CRON_SECRET}`.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMailgun } from "@/lib/mailgun";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type OverduePayment = {
  id: string;
  tenant_id: string;
  payer_id: string | null;
  student_id: string | null;
  due_date: string;
  amount: number;
  student_name_snapshot: string | null;
  payer_name_snapshot: string | null;
  days_overdue: number;
};

type Payer = { id: string; name: string | null; email: string | null };
type TenantSettings = { tenant_id: string; brand_name: string | null };

function computeDaysOverdue(dueDate: string, today: string): number {
  // Both YYYY-MM-DD strings; UTC math
  const d1 = new Date(`${today}T00:00:00Z`).getTime();
  const d2 = new Date(`${dueDate}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((d1 - d2) / 86400000));
}

function fmtBRL(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDateBR(s: string): string {
  try {
    return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
  } catch {
    return s;
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    console.warn("[cron:dunning-reminders] unauthorized", { hasHeader: !!header });
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

    const today = new Date().toISOString().slice(0, 10);
    const ym = today.slice(0, 7);
    console.log("[cron:dunning-reminders] start", { ym, today });

    // 1) Buscar todos os payments pendentes vencidos (cross-tenant via service role)
    type PaymentSelect = {
      id: string;
      tenant_id: string | null;
      payer_id: string | null;
      student_id: string | null;
      due_date: string | null;
      amount: number | string | null;
      status: string;
      student_name_snapshot: string | null;
      payer_name_snapshot: string | null;
    };

    const { data: pendingRaw, error: pErr } = await supabase
      .from("payments")
      .select(
        "id, tenant_id, payer_id, student_id, due_date, amount, status, student_name_snapshot, payer_name_snapshot"
      )
      .eq("status", "pending")
      .lt("due_date", today)
      .returns<PaymentSelect[]>();
    if (pErr) throw pErr;

    const overdue: OverduePayment[] = (pendingRaw || [])
      .filter((p) => !!p.tenant_id && !!p.due_date)
      .map((p) => ({
        id: p.id,
        tenant_id: p.tenant_id as string,
        payer_id: p.payer_id,
        student_id: p.student_id,
        due_date: String(p.due_date).slice(0, 10),
        amount: Number(p.amount ?? 0),
        student_name_snapshot: p.student_name_snapshot,
        payer_name_snapshot: p.payer_name_snapshot,
        days_overdue: computeDaysOverdue(
          String(p.due_date).slice(0, 10),
          today
        ),
      }))
      .filter((p) => p.days_overdue > 0);

    if (overdue.length === 0) {
      console.log("[cron:dunning-reminders] done", { ym, sent: 0, reason: "no_overdue" });
      return NextResponse.json({
        ok: true,
        sent: 0,
        msg: "Sem pendências em atraso.",
      });
    }

    // 2) Lookup paralelo: payers (por id) + tenant_settings (brand_name por tenant)
    const payerIds = [
      ...new Set(overdue.map((o) => o.payer_id).filter((x): x is string => !!x)),
    ];
    const tenantIds = [...new Set(overdue.map((o) => o.tenant_id))];

    const [{ data: payersData, error: payErr }, { data: tsData, error: tsErr }] =
      await Promise.all([
        payerIds.length > 0
          ? supabase
              .from("payers")
              .select("id, name, email")
              .in("id", payerIds)
          : Promise.resolve({ data: [] as Payer[], error: null }),
        supabase
          .from("tenant_settings")
          .select("tenant_id, brand_name")
          .in("tenant_id", tenantIds),
      ]);
    if (payErr) throw payErr;
    if (tsErr) throw tsErr;

    const payerById = new Map<string, Payer>(
      (payersData || []).map((p) => [
        p.id as string,
        {
          id: p.id as string,
          name: (p.name as string | null) ?? null,
          email: (p.email as string | null) ?? null,
        },
      ])
    );

    const brandByTenant = new Map<string, string>();
    for (const t of (tsData || []) as TenantSettings[]) {
      const name = String(t.brand_name || "").trim();
      if (t.tenant_id && name) brandByTenant.set(t.tenant_id, name);
    }

    // 3) Agrupar por (tenant_id, payer_id) — só inclui se tem email
    const groups = new Map<string, OverduePayment[]>();
    for (const o of overdue) {
      if (!o.payer_id) continue;
      const py = payerById.get(o.payer_id);
      const email = py?.email?.trim();
      if (!email) continue;
      const key = `${o.tenant_id}::${o.payer_id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(o);
    }

    if (groups.size === 0) {
      console.log("[cron:dunning-reminders] done", { ym, sent: 0, reason: "no_payer_email" });
      return NextResponse.json({
        ok: true,
        sent: 0,
        msg: "Existem pendências, mas nenhum pagador com e-mail cadastrado.",
      });
    }

    // 4) Disparar e-mails (1 por grupo (tenant, pagador))
    const results: Array<{
      tenant_id: string;
      payer_id: string;
      to: string;
      ok: boolean;
      status: number;
      detail: string | null;
    }> = [];

    for (const [key, items] of groups.entries()) {
      const [tenant_id, payer_id] = key.split("::");
      const payer = payerById.get(payer_id)!;
      const to = payer.email!;
      const payerName = payer.name || "Responsável";
      const brandName = brandByTenant.get(tenant_id) || null;
      const senderLabel = brandName || "Sua escola";

      const tableRows = items
        .map(
          (r) => `
          <tr>
            <td style="padding:6px 8px;border:1px solid #eee">${
              r.student_name_snapshot || "Aluno"
            }</td>
            <td style="padding:6px 8px;border:1px solid #eee">${fmtDateBR(
              r.due_date
            )}</td>
            <td style="padding:6px 8px;border:1px solid #eee">${fmtBRL(
              r.amount
            )}</td>
            <td style="padding:6px 8px;border:1px solid #eee">${
              r.days_overdue
            } dia(s)</td>
          </tr>`
        )
        .join("");

      const subject = `Lembrete: mensalidade(s) em atraso · ${senderLabel}`;
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#1f2937;">
          <p>Olá ${payerName},</p>
          <p>Identificamos mensalidade(s) em atraso referente(s) ao mês ${ym}:</p>
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
          <p>Atenciosamente,<br/><b>${senderLabel}</b></p>
        </div>
      `;

      const r = await sendMailgun({
        to,
        subject,
        html,
        fromName: brandName, // ← alias = nome do tenant (cai pro default se null)
      });
      results.push({
        tenant_id,
        payer_id,
        to,
        ok: r.ok,
        status: r.ok ? 200 : r.status ?? 500,
        detail: r.ok ? null : r.error ?? null,
      });
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;
    const logDone = failed > 0 ? console.error : console.log;
    logDone(
      `[cron:dunning-reminders] ${failed > 0 ? "done with failures" : "done"}`,
      { ym, sent, failed, total: results.length }
    );
    if (failed > 0) {
      // Detalhe por falha SEM PII (sem o e-mail 'to').
      console.error(
        "[cron:dunning-reminders] failures",
        results
          .filter((r) => !r.ok)
          .map(({ tenant_id, payer_id, status, detail }) => ({ tenant_id, payer_id, status, detail }))
      );
    }
    // Resposta agregada (sem PII): não devolve 'results' com e-mails.
    return NextResponse.json({ ok: true, sent, failed, total: results.length });
  } catch (err) {
    console.error(
      "[cron:dunning-reminders] error",
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// src/lib/server/monthlyGeneration.ts
// SERVER-ONLY. Geração dos lançamentos mensais (mensalidades, gastos recorrentes,
// outras receitas) parametrizada por tenant_id, para o cron multi-tenant rodar
// com SERVICE ROLE (sem sessão → sem current_tenant_id()).
//
// Replica a lógica do botão "Prévia" do Financeiro (paymentGateway.generateMonth,
// expenseGateway.generateExpenses, otherRevenueGateway.ensureOtherRevenuesForMonth),
// mas com tenant_id EXPLÍCITO em TODA query/insert — o service role bypassa a RLS,
// então o escopo por tenant é nossa responsabilidade aqui.
//
// Idempotente: pula lançamentos já existentes (por competence_month) e trata
// 23505 (duplicado) como no-op → re-rodar o cron não duplica.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isRecurrenceActiveForMonth } from "@/lib/gateways/helpers";

type Admin = SupabaseClient;

export interface MensalidadesResult {
  inserted: number;
  skipped_existing: number;
  created_payers: number;
}

// Mensalidades dos alunos ativos com monthly_value > 0.
export async function generateMensalidadesForTenant(
  admin: Admin,
  tenantId: string,
  ym: string
): Promise<MensalidadesResult> {
  const monthStart = `${ym}-01`;
  const [Y, M] = ym.split("-").map(Number);

  const { data: students, error: e1 } = await admin
    .from("students")
    .select("id, name, monthly_value, due_day, payer_id, status")
    .eq("tenant_id", tenantId)
    .eq("status", "ativo");
  if (e1) throw new Error(`generateMensalidades.students: ${e1.message}`);

  const candidates = (students || []).filter((s) => Number(s.monthly_value || 0) > 0);
  if (!candidates.length) return { inserted: 0, skipped_existing: 0, created_payers: 0 };

  const { data: existing, error: e2 } = await admin
    .from("payments")
    .select("student_id")
    .eq("tenant_id", tenantId)
    .eq("competence_month", monthStart)
    .neq("status", "canceled");
  if (e2) throw new Error(`generateMensalidades.existing: ${e2.message}`);
  const exists = new Set((existing || []).map((p) => p.student_id));

  const toProcess = candidates.filter((s) => !exists.has(s.id));
  if (!toProcess.length) {
    return { inserted: 0, skipped_existing: candidates.length, created_payers: 0 };
  }

  const { data: payers, error: e3 } = await admin
    .from("payers")
    .select("id, name")
    .eq("tenant_id", tenantId);
  if (e3) throw new Error(`generateMensalidades.payers: ${e3.message}`);

  const payerName = new Map((payers || []).map((p) => [p.id, p.name]));
  const payerIds = new Set((payers || []).map((p) => p.id));
  const payerByName = new Map(
    (payers || []).map((p) => [String(p.name || "").trim().toLowerCase(), p.id])
  );

  let createdPayers = 0;
  const toInsert: Record<string, unknown>[] = [];

  for (const s of toProcess) {
    let payer_id: string | null = s.payer_id || null;

    // Garante um pagador (reusa por nome ou cria) e vincula ao aluno.
    if (!payer_id || !payerIds.has(payer_id)) {
      const key = String(s.name || "").trim().toLowerCase();
      const reuseId = key ? payerByName.get(key) : null;
      if (reuseId) {
        payer_id = reuseId;
      } else {
        const { data: createdPayer, error: ep } = await admin
          .from("payers")
          .insert({ tenant_id: tenantId, name: s.name })
          .select("id, name")
          .single();
        if (ep) throw new Error(`generateMensalidades.createPayer: ${ep.message}`);
        payer_id = createdPayer.id;
        payerIds.add(payer_id as string);
        payerName.set(payer_id as string, createdPayer.name);
        if (key) payerByName.set(key, payer_id as string);
        createdPayers += 1;
      }
      const { error: es } = await admin
        .from("students")
        .update({ payer_id })
        .eq("tenant_id", tenantId)
        .eq("id", s.id);
      if (es) throw new Error(`generateMensalidades.linkPayer: ${es.message}`);
    }

    const due_date = new Date(Date.UTC(Y, M - 1, Number(s.due_day || 5)))
      .toISOString()
      .slice(0, 10);
    const pyName = payerName.get(payer_id as string) || s.name;

    toInsert.push({
      tenant_id: tenantId,
      student_id: s.id,
      payer_id,
      competence_month: monthStart,
      due_date,
      amount: Number(s.monthly_value || 0),
      status: "pending",
      paid_at: null,
      canceled_at: null,
      cancel_note: null,
      created_at: new Date().toISOString(),
      student_name_snapshot: s.name,
      payer_name_snapshot: pyName,
    });
  }

  if (!toInsert.length) {
    return { inserted: 0, skipped_existing: candidates.length, created_payers: createdPayers };
  }

  const { error } = await admin.from("payments").insert(toInsert);
  if (!error) {
    return {
      inserted: toInsert.length,
      skipped_existing: candidates.length - toInsert.length,
      created_payers: createdPayers,
    };
  }

  // Conflito em lote (corrida com a Prévia manual no browser) → o Postgres aborta
  // o lote INTEIRO. Re-tenta linha a linha ignorando duplicados, para não perder
  // as mensalidades legítimas que não colidiram (mesmo padrão de generateExpenses).
  if (error.code === "23505") {
    let inserted = 0;
    for (const row of toInsert) {
      const { error: er } = await admin.from("payments").insert(row);
      if (er && er.code !== "23505") {
        throw new Error(`generateMensalidades.insertRow: ${er.message}`);
      }
      if (!er) inserted += 1;
    }
    return {
      inserted,
      skipped_existing: candidates.length - inserted,
      created_payers: createdPayers,
    };
  }

  throw new Error(`generateMensalidades.insert: ${error.message}`);
}

// Gastos recorrentes a partir de expense_templates ativos.
export async function generateExpensesForTenant(
  admin: Admin,
  tenantId: string,
  ym: string
): Promise<number> {
  const mStart = `${ym}-01`;
  const [Y, M] = ym.split("-").map(Number);

  const { data: templates, error: eT } = await admin
    .from("expense_templates")
    .select(
      "id, title, category, amount, frequency, due_day, due_month, cost_center, active, recurrence_mode, start_month, installments, end_month"
    )
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (eT) throw new Error(`generateExpenses.templates: ${eT.message}`);

  const { data: existing, error: eX } = await admin
    .from("expense_entries")
    .select("template_id")
    .eq("tenant_id", tenantId)
    .eq("competence_month", mStart);
  if (eX) throw new Error(`generateExpenses.existing: ${eX.message}`);
  const existingSet = new Set((existing || []).map((r) => r.template_id).filter(Boolean));

  const toInsert: Record<string, unknown>[] = [];
  for (const t of templates || []) {
    if (!isRecurrenceActiveForMonth(t, mStart)) continue;
    if (String(t.frequency || "monthly") === "annual") {
      if (!t.due_month || Number(t.due_month) !== M) continue;
    }
    if (existingSet.has(t.id)) continue;

    const day = Math.min(Math.max(Number(t.due_day || 5), 1), 28);
    const due_date = `${Y}-${String(M).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    toInsert.push({
      tenant_id: tenantId,
      template_id: t.id,
      title_snapshot: t.title,
      category: t.category,
      amount: Number(t.amount || 0),
      competence_month: mStart,
      due_date,
      status: "pending",
      paid_at: null,
      canceled_at: null,
      cancel_note: null,
      cost_center: t.cost_center || "PJ",
    });
  }

  if (!toInsert.length) return 0;

  const { error: eI } = await admin.from("expense_entries").insert(toInsert);
  if (!eI) return toInsert.length;

  // Conflito em lote → re-tenta linha a linha, ignorando duplicados (idempotente).
  if (eI.code === "23505") {
    let inserted = 0;
    for (const row of toInsert) {
      const { error } = await admin.from("expense_entries").insert(row);
      if (error && error.code !== "23505") {
        throw new Error(`generateExpenses.insertRow: ${error.message}`);
      }
      if (!error) inserted += 1;
    }
    return inserted;
  }

  throw new Error(`generateExpenses.insert: ${eI.message}`);
}

// Outras receitas recorrentes — via RPC SECURITY DEFINER parametrizada por tenant.
export async function ensureOtherRevenuesForTenant(
  admin: Admin,
  tenantId: string,
  ym: string
): Promise<{ created: number }> {
  const { data, error } = await admin.rpc("ensure_other_revenues_for_month", {
    p_tenant: tenantId,
    p_ym: ym,
  });
  if (error) throw new Error(`ensureOtherRevenues: ${error.message}`);
  return (data as { created: number }) ?? { created: 0 };
}

// src/lib/financeGateway.js
import { supabaseGateway } from "@/lib/supabaseGateway";

/**
 * Adapter “fino”: reexporta do supabaseGateway somente o que o app usa.
 * Mantém a mesma assinatura dos métodos já chamados no front.
 */

export const ADAPTER_NAME = "supabase";

// ---------- Financeiro: Receitas (mensalidades) ----------
async function listPayments({ ym, status = null }) {
  return supabaseGateway.listPayments({ ym, status });
}
async function markPaid(id) {
  return supabaseGateway.markPaid(id);
}
async function cancelPayment(id, note) {
  return supabaseGateway.cancelPayment(id, note);
}
async function reopenPayment(id) {
  return supabaseGateway.reopenPayment(id);
}

// KPIs + centros de custo (cards + tabela)
async function getMonthlySummary({ ym, cost_center = null }) {
  return supabaseGateway.getMonthlyFinanceKpis({ ym, cost_center });
}

// ---------- Financeiro: Despesas (templates + entries) ----------
async function listExpenseTemplates(opts = {}) {
  return supabaseGateway.listExpenseTemplates(opts);
}
async function createExpenseTemplate(payload) {
  return supabaseGateway.createExpenseTemplate(payload);
}
async function updateExpenseTemplate(id, changes = {}) {
  return supabaseGateway.updateExpenseTemplate(id, changes);
}
async function deleteExpenseTemplate(id) {
  return supabaseGateway.deleteExpenseTemplate(id);
}

async function listExpenseEntries({ ym, status = "all", cost_center = null } = {}) {
  // O supabaseGateway já aplica o filtro por mês e (opcional) status
  // O filtro por cost_center está contemplado nos KPIs; para a lista,
  // se precisar filtrar client-side, faça na página. Mantemos a assinatura.
  const out = await supabaseGateway.listExpenseEntries({ ym, status });
  if (!cost_center || cost_center === "all") return out;
  const rows = (out?.rows || []).filter(
    (r) => (r.cost_center || "PJ") === cost_center
  );
  const sum = (arr) => arr.reduce((a, b) => a + Number(b.amount || 0), 0);
  return {
    rows,
    kpis: {
      total:   sum(rows),
      paid:    sum(rows.filter((r) => r.status === "paid")),
      pending: sum(rows.filter((r) => r.status === "pending")),
      overdue: sum(rows.filter((r) => r.status === "pending" && r.days_overdue > 0)),
    },
  };
}
async function createExpenseEntry(payload) {
  return supabaseGateway.createExpenseEntry(payload);
}
async function markExpensePaid(id) {
  return supabaseGateway.markExpensePaid(id);
}
async function cancelExpense(id, note = null) {
  return supabaseGateway.cancelExpense(id, note);
}
async function reopenExpense(id) {
  return supabaseGateway.reopenExpense(id);
}

async function previewGenerateExpenses({ ym, cost_center = null } = {}) {
  // preview é agrupado por mês; para filtrar por cost_center, filtramos aqui se vier informado
  const preview = await supabaseGateway.previewGenerateExpenses({ ym, cost_center: null });
  if (!cost_center || cost_center === "all") return preview;
  return (preview || []).filter((p) => (p.cost_center || "PJ") === cost_center);
}
async function generateExpenses({ ym, cost_center = null } = {}) {
  return supabaseGateway.generateExpenses({ ym, cost_center });
}

// ---------- Outras Receitas ----------
async function listOtherRevenues({ ym, status = "all" } = {}) {
  return supabaseGateway.listOtherRevenues({ ym, status });
}
async function createOtherRevenue(payload) {
  return supabaseGateway.createOtherRevenue(payload);
}
async function markOtherRevenuePaid(id) {
  return supabaseGateway.markOtherRevenuePaid(id);
}
async function cancelOtherRevenue(id, note = null) {
  return supabaseGateway.cancelOtherRevenue(id, note);
}
async function reopenOtherRevenue(id) {
  return supabaseGateway.reopenOtherRevenue(id);
}

// ---------- Professores (payout) ----------
async function sumTeacherPayoutByMonth(teacherId, ym) {
  return supabaseGateway.sumTeacherPayoutByMonth(teacherId, ym);
}
async function listTeacherSessionsByMonth(teacherId, ym) {
  return supabaseGateway.listTeacherSessionsByMonth(teacherId, ym);
}

// ---------- Agenda (usados no fluxo da agenda) ----------
async function createSession(payload) {
  // usado ao clicar em “Registrar aula”
  return supabaseGateway.createSession(payload);
}
async function listSessionsWithAttendance({ turmaId, start, end }) {
  return supabaseGateway.listSessionsWithAttendance({ turmaId, start, end });
}

// Exporte o objeto compacto usado no app
export const financeGateway = {
  // Receitas (mensalidades)
  listPayments,
  markPaid,
  cancelPayment,
  reopenPayment,
  getMonthlySummary,

  // Despesas
  listExpenseTemplates,
  createExpenseTemplate,
  updateExpenseTemplate,
  deleteExpenseTemplate,
  listExpenseEntries,
  createExpenseEntry,
  markExpensePaid,
  cancelExpense,
  reopenExpense,
  previewGenerateExpenses,
  generateExpenses,

  // Outras receitas
  listOtherRevenues,
  createOtherRevenue,
  markOtherRevenuePaid,
  cancelOtherRevenue,
  reopenOtherRevenue,

  // Professores
  sumTeacherPayoutByMonth,
  listTeacherSessionsByMonth,

  // Agenda
  createSession,
  listSessionsWithAttendance,
};

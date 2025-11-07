// src/lib/financeGateway.js
import { supabaseGateway } from "@/lib/supabaseGateway";

/**
 * Adapter “fino”: reexporta do supabaseGateway somente o que o app usa.
 * Mantém a mesma assinatura dos métodos já chamados no front.
 */

export const ADAPTER_NAME = "supabase";

// ---------- Financeiro: Receitas (mensalidades) ----------
async function listPayments({ ym, status = null } = {}) {
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

// ---------- KPIs / Sumário ----------
async function getMonthlySummary({ ym, cost_center = null }) {
  // fonte única do resumo (RLS aplica o tenant via JWT)
  return supabaseGateway.getMonthlyFinancialSummary({ ym, cost_center });
}
// --- Relatórios ---
async function reportReceivablesAging({ ym, }) {
  return supabaseGateway.reportReceivablesAging({ ym, });
}

// alias explícito para a mesma função
async function getMonthlyFinancialSummary(args) {
  return supabaseGateway.getMonthlyFinancialSummary(args);
}
// kpis “clássicos” (se ainda houver lugares chamando)
async function getMonthlyFinanceKpis(args) {
  return supabaseGateway.getMonthlyFinanceKpis(args);
}
async function getCombinedRevenueKpis({ ym }) {
  return supabaseGateway.getCombinedRevenueKpis({ ym });
}
// ---------- Despesas (templates + entries) ----------
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
  // Normaliza antes de descer pro gateway
  const normalizedStatus =
    status && status !== "all" ? String(status) : null;
  const normalizedCenter =
    cost_center && cost_center !== "all" ? String(cost_center).toUpperCase() : null;

  const out = await supabaseGateway.listExpenseEntries({
    ym,
    status: normalizedStatus,
    cost_center: normalizedCenter, // ⬅️ agora o gateway filtra no server
  });

  // Garante shape consistente
  return {
    rows: Array.isArray(out?.rows) ? out.rows : [],
    kpis: out?.kpis ?? { total: 0, paid: 0, pending: 0, overdue: 0 },
  };
}
// --- ALIAS p/ compatibilidade com telas antigas ---
async function createOneOffExpense({ date, amount, title, category = null, cost_center = "PJ" }) {
  return createExpenseEntry({
    due_date: date,
    amount,
    description: title,
    category,
    cost_center,
  });
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
  const preview = await supabaseGateway.previewGenerateExpenses({ ym, cost_center: null });
  if (!cost_center || cost_center === "all") return preview;
  return (preview || []).filter((p) => (p.cost_center || "PJ") === cost_center);
}
async function generateExpenses({ ym, cost_center = null } = {}) {
  return supabaseGateway.generateExpenses({ ym, cost_center });
}

// ---------- Outras Receitas ----------
async function listOtherRevenues({ ym, status = "all", cost_center = null } = {}) {
  return supabaseGateway.listOtherRevenues({ ym, status, cost_center });
}
async function createOtherRevenue(payload) {
  return supabaseGateway.createOtherRevenue(payload);
}
// Criação de série parcelada (simple loop gerando N meses)
async function createOtherRevenueInstallments({
  ym,
  title,
  amount,
  total_installments,
  due_day = 5,
  category = null,
  cost_center = "extra",
} = {}) {
  const n = Math.max(1, Number(total_installments || 1));
  const results = [];
  // helper para avançar mês (YYYY-MM)
  const addMonth = (ymStr, offset) => {
    const [Y, M] = ymStr.split("-").map(Number);
    const date = new Date(Y, M - 1 + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  for (let i = 0; i < n; i++) {
    const currYm = addMonth(ym, i); // YYYY-MM
    // due_date construído do dia escolhido
    const due_date = `${currYm}-${String(due_day).padStart(2, "0")}`;
    const row = await supabaseGateway.createOtherRevenue({
      ym: currYm,
      title: `${title} (${i + 1}/${n})`,
      amount,
      due_date,
      category,
      cost_center,
      // sinaliza campos para se existirem nas colunas
      installment_index: i + 1,
      installments_total: n,
      recurrence_kind: "installments",
      frequency: "monthly",
      start_month: `${ym}-01`,
      end_month: `${addMonth(ym, n - 1)}-01`,
    });
    results.push(row);
  }
  return results;
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
async function updateOtherRevenue(id, changes = {}, opts = {}) {
  return supabaseGateway.updateOtherRevenue(id, changes, opts);
}
async function cancelOtherRevenueSeriesFrom(id, note = null) {
  return supabaseGateway.cancelOtherRevenueSeriesFrom(id, note);
}
async function ensureOtherRevenuesForMonth(ym) {
  return supabaseGateway.ensureOtherRevenuesForMonth(ym);
}
async function deleteOtherRevenue(id) {
  return supabaseGateway.deleteOtherRevenue(id);
}
async function deleteOtherRevenueSeriesFrom(id) {
  return supabaseGateway.deleteOtherRevenueSeriesFrom(id);
}
// Criação de template para outras receitas (autogeração)
async function createOtherRevenueTemplate(payload) {
  return supabaseGateway.createOtherRevenueTemplate(payload);
}

// ---------- Professores (payout) ----------
async function sumTeacherPayoutByMonth(teacherId, ym) {
  return supabaseGateway.sumTeacherPayoutByMonth(teacherId, ym);
}
async function listTeacherSessionsByMonth(teacherId, ym) {
  return supabaseGateway.listTeacherSessionsByMonth(teacherId, ym);
}
async function updateTeacher(id, changes = {}) {
  return supabaseGateway.updateTeacher(id, changes);
}
async function createTeacher(payload = {}) {
  return supabaseGateway.createTeacher(payload);
}

// --- Cadastro (listas básicas) ---
async function listTeachers() {
  return supabaseGateway.listTeachers();
}
async function listTurmas() {
  return supabaseGateway.listTurmas();
}
async function listStudents() {
  return supabaseGateway.listStudents();
}
async function setStudentStatus(id, status) {
  return supabaseGateway.setStudentStatus(id, status);
}
async function listTurmaMembers(turmaId) {
  return supabaseGateway.listTurmaMembers(turmaId);
}
async function listAttendanceByStudent(studentId) {
  return supabaseGateway.listAttendanceByStudent(studentId);
}
async function updateStudent(id, changes = {}) {
  return supabaseGateway.updateStudent(id, changes);
}
// --- Students ---
async function createStudent(payload) {
  return supabaseGateway.createStudent(payload);
}
async function deleteStudent(id) {
  return supabaseGateway.deleteStudent(id);
}


// --- Pagadores ---
async function listPayers(opts = {}) {
  return supabaseGateway.listPayers(opts);
}
async function createPayer(payload) {
  return supabaseGateway.createPayer(payload);
}
async function updatePayer(id, changes = {}) {
  return supabaseGateway.updatePayer(id, changes);
}
async function deletePayer(id) {
  return supabaseGateway.deletePayer(id);
}

// ---------- Agenda (usados no fluxo da agenda) ----------
async function createSession(payload) {
  return supabaseGateway.createSession(payload);
}
async function listSessionsWithAttendance({ turmaId, start, end }) {
  return supabaseGateway.listSessionsWithAttendance({ turmaId, start, end });
}
async function listSessions(turmaId) {
  return supabaseGateway.listSessions(turmaId);
}
async function updateSession(id, changes = {}) {
  return supabaseGateway.updateSession(id, changes);
}
async function deleteSession(id) {
  return supabaseGateway.deleteSession(id);
}
async function listAttendance(sessionId) {
  return supabaseGateway.listAttendance(sessionId);
}
async function upsertAttendance(sessionId, studentId, payload) {
  return supabaseGateway.upsertAttendance(sessionId, studentId, payload);
}
async function deleteAttendance(sessionId, studentId) {
  return supabaseGateway.deleteAttendance(sessionId, studentId);
}

// ---------- Financeiro: mensalidades (geração) ----------
async function previewGenerateMonth({ ym }) {
  return supabaseGateway.previewGenerateMonth({ ym });
}
async function generateMonth({ ym }) {
  return supabaseGateway.generateMonth({ ym });
}
async function deleteExpenseEntry(id, opts = {}) {
  return supabaseGateway.deleteExpenseEntry(id, opts);
}
async function createTurma(payload) {
  return supabaseGateway.createTurma(payload);
}
async function updateTurma(id, changes = {}) {
  return supabaseGateway.updateTurma(id, changes);
}
async function deleteTurma(id) {
  return supabaseGateway.deleteTurma(id);
}

// ---------- Turmas: vínculos aluno–turma ----------
async function addStudentToTurma(turmaId, studentId) {
  return supabaseGateway.addStudentToTurma(turmaId, studentId);
}
async function removeStudentFromTurma(turmaId, studentId) {
  return supabaseGateway.removeStudentFromTurma(turmaId, studentId);
}
// Exporte o objeto compacto usado no app
export const financeGateway = {
  // Receitas (mensalidades)
  listPayments,
  markPaid,
  cancelPayment,
  reopenPayment,
  previewGenerateMonth,
  generateMonth,
  deleteExpenseEntry,

  // KPIs / Sumário
  getMonthlySummary,
  getMonthlyFinancialSummary,
  getMonthlyFinanceKpis,
  reportReceivablesAging,
  getCombinedRevenueKpis,

  // Despesas
  listExpenseTemplates,
  createExpenseTemplate,
  updateExpenseTemplate,
  deleteExpenseTemplate,
  listExpenseEntries,
  createExpenseEntry,
  createOneOffExpense,
  markExpensePaid,
  cancelExpense,
  reopenExpense,
  previewGenerateExpenses,
  generateExpenses,
  deleteExpenseEntry,

  // Outras receitas
  listOtherRevenues,
  createOtherRevenue,
  createOtherRevenueInstallments,
  markOtherRevenuePaid,
  cancelOtherRevenue,
  reopenOtherRevenue,
  updateOtherRevenue,
  cancelOtherRevenueSeriesFrom,
  ensureOtherRevenuesForMonth,
  deleteOtherRevenue,
  deleteOtherRevenueSeriesFrom,
  createOtherRevenueTemplate,

  // Categorias de Despesas
  listExpenseCategories: () => supabaseGateway.listExpenseCategories(),
  createExpenseCategory: (payload) => supabaseGateway.createExpenseCategory(payload),
  updateExpenseCategory: (id, changes) => supabaseGateway.updateExpenseCategory(id, changes),
  deleteExpenseCategory: (id) => supabaseGateway.deleteExpenseCategory(id),

  // Professores
  sumTeacherPayoutByMonth,
  listTeacherSessionsByMonth,
  updateTeacher,
  createTeacher,

  // Cadastro
  listTeachers,
  listTurmas,
  listStudents,
  setStudentStatus,
  listTurmaMembers,
  listAttendanceByStudent,
  updateStudent,
  listPayers,
  createPayer,
  updatePayer,
  deletePayer,
  createStudent,
  deleteStudent,


  // Agenda
  createSession,
  listSessionsWithAttendance,
  listSessions,
  listAttendance,
  upsertAttendance,
  deleteAttendance,
  updateSession,
  deleteSession,

  // Turmas
  createTurma,
  updateTurma,
  deleteTurma,
  addStudentToTurma,
  removeStudentFromTurma,
  // Relatórios
  reportReceivablesAging,
};

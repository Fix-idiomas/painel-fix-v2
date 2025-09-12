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

// KPIs no formato da UI (usa o método novo do supabaseGateway)
async function getMonthlySummary({ ym, tenant_id, cost_center = null }) {
  return supabaseGateway.getMonthlyFinancialSummary({ ym, tenant_id, cost_center });
}

async function getMonthlyFinanceKpis(args) {
  return supabaseGateway.getMonthlyFinanceKpis(args);
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
// ---------- Turmas (CRUD) ----------
async function createTurma(payload) {
  return supabaseGateway.createTurma(payload);
}
async function updateTurma(id, changes) {
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
async function listAttendance(sessionId) {
  return supabaseGateway.listAttendance(sessionId);
}

async function upsertAttendance(sessionId, studentId, payload) {
  return supabaseGateway.upsertAttendance(sessionId, studentId, payload);
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
// --- ALIAS p/ compatibilidade com telas antigas ---
async function createOneOffExpense({ date, amount, title, category = null, cost_center = "PJ" }) {
  // redireciona para o contrato canônico
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
// --- Professores ---
async function updateTeacher(id, changes = {}) {
  return supabaseGateway.updateTeacher(id, changes);
}
async function createTeacher(payload = {}) {
  return supabaseGateway.createTeacher(payload);
}


// --- Turmas (membros) ---
async function listTurmaMembers(turmaId) {
  return supabaseGateway.listTurmaMembers(turmaId);
}
async function updateSession(id, changes = {}) {
  return supabaseGateway.updateSession(id, changes);
}
// ⬇️ ADICIONE ESTE WRAPPER
async function listSessions(turmaId) {
  return supabaseGateway.listSessions(turmaId);
}

// ---------- Agenda (usados no fluxo da agenda) ----------
async function createSession(payload) {
  // usado ao clicar em “Registrar aula”
  return supabaseGateway.createSession(payload);
}
async function listSessionsWithAttendance({ turmaId, start, end }) {
  return supabaseGateway.listSessionsWithAttendance({ turmaId, start, end });
}
// --- Sessões (aulas) ---
async function deleteSession(id) {
  return supabaseGateway.deleteSession(id);
}

async function deleteExpenseEntry(id) {
  return supabaseGateway.cancelExpense(id, "[UI] removido pela tela");
}
// alias para compatibilidade com a Home
async function getMonthlyFinancialSummary(args) {
  return supabaseGateway.getMonthlySummary(args);// ok — args já pode carregar tenant_id
}
async function listStudents() {
  return supabaseGateway.listStudents();
}

  // --- Cadastro (listas básicas) ---
async function listTeachers() {
  return supabaseGateway.listTeachers();
}
async function listTurmas() {
  return supabaseGateway.listTurmas();
}

async function setStudentStatus(id, status) {
  return supabaseGateway.setStudentStatus(id, status);
}

// --- Presenças por aluno ---
async function listAttendanceByStudent(studentId) {
  return supabaseGateway.listAttendanceByStudent(studentId);
}
async function updateStudent(id, changes = {}) {
  return supabaseGateway.updateStudent(id, changes);
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
async function deleteAttendance(sessionId, studentId) {
  return supabaseGateway.deleteAttendance(sessionId, studentId);
}

//Financeiro
async function previewGenerateMonth({ ym, tenant_id }) {
  return supabaseGateway.previewGenerateMonth({ ym, tenant_id });
  }
async function generateMonth({ ym, tenant_id }) {
  return supabaseGateway.generateMonth({ ym, tenant_id });
}


// Exporte o objeto compacto usado no app
export const financeGateway = {
   // Receitas (mensalidades)
  // ==============================
  listPayments,
  markPaid,
  cancelPayment,
  reopenPayment,
  previewGenerateMonth,
  generateMonth,

  // ==============================
  // KPIs / Sumário
  // ==============================
  getMonthlySummary,              // <- wrapper deve chamar supabaseGateway.getMonthlyFinancialSummary
  getMonthlyFinancialSummary,     // alias
  getMonthlyFinanceKpis: getMonthlySummary, // compat (alguns pontos ainda chamam por este nome)

  // ==============================
  // Despesas
  // ==============================
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

  // ==============================
  // Outras receitas
  // ==============================
  listOtherRevenues,
  createOtherRevenue,
  markOtherRevenuePaid,
  cancelOtherRevenue,
  reopenOtherRevenue,

  // ==============================
  // Professores
  // ==============================
  sumTeacherPayoutByMonth,
  listTeacherSessionsByMonth,

  // ==============================
  // Cadastro
  // ==============================
  listTeachers,
  listTurmas,
  listStudents,
  setStudentStatus,
  listTurmaMembers,
  listAttendanceByStudent,
  listPayers,
  createPayer,
  updatePayer,
  deletePayer,
  updateTeacher,
  createTeacher,
  updateStudent,

  // ==============================
  // Agenda
  // ==============================
  createSession,
  listSessionsWithAttendance,
  listSessions,
  listAttendance,
  upsertAttendance,
  deleteAttendance,
  updateSession,
  deleteSession,

  // ==============================
  // Turmas
  // ==============================
  createTurma,
  updateTurma,
  deleteTurma,
  addStudentToTurma,
  removeStudentFromTurma,
};
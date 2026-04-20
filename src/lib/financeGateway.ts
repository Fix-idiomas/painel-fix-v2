import { supabaseGateway } from "@/lib/supabaseGateway";
import type { CreateTeacherPayload, UpdateTeacherPayload } from "@/types";

export const ADAPTER_NAME = "supabase";

type Dict = Record<string, unknown>;

// ---------- Financeiro: Receitas (mensalidades) ----------
async function listPayments({ ym, status = null }: { ym?: string; status?: string | null } = {}) {
  return supabaseGateway.listPayments({ ym, status });
}
async function markPaid(id: string) {
  return supabaseGateway.markPaid(id);
}
async function cancelPayment(id: string, note?: string | null) {
  return supabaseGateway.cancelPayment(id, note);
}
async function reopenPayment(id: string) {
  return supabaseGateway.reopenPayment(id);
}

// ---------- KPIs / Sumário ----------
async function getMonthlySummary({ ym, cost_center = null }: { ym: string; cost_center?: string | null }) {
  return supabaseGateway.getMonthlyFinancialSummary({ ym, cost_center });
}
async function reportReceivablesAging({ ym }: { ym: string }) {
  return supabaseGateway.reportReceivablesAging({ ym });
}
async function getMonthlyFinancialSummary(args: { ym: string; cost_center?: string | null }) {
  return supabaseGateway.getMonthlyFinancialSummary(args);
}
async function getMonthlyFinanceKpis(args: { ym: string; cost_center?: string | null }) {
  return supabaseGateway.getMonthlyFinanceKpis(args);
}
async function getCombinedRevenueKpis({ ym }: { ym: string }) {
  return supabaseGateway.getCombinedRevenueKpis({ ym });
}

// ---------- Despesas (templates + entries) ----------
async function listExpenseTemplates(opts: Dict = {}) {
  return supabaseGateway.listExpenseTemplates(opts);
}
async function createExpenseTemplate(payload: Dict) {
  return supabaseGateway.createExpenseTemplate(payload);
}
async function updateExpenseTemplate(id: string, changes: Dict = {}) {
  return supabaseGateway.updateExpenseTemplate(id, changes);
}
async function deleteExpenseTemplate(id: string) {
  return supabaseGateway.deleteExpenseTemplate(id);
}

interface ListExpenseEntriesArgs {
  ym?: string;
  status?: string;
  cost_center?: string | null;
}
async function listExpenseEntries({ ym, status = "all", cost_center = null }: ListExpenseEntriesArgs = {}) {
  const normalizedStatus = status && status !== "all" ? String(status) : null;
  const normalizedCenter =
    cost_center && cost_center !== "all" ? String(cost_center).toUpperCase() : null;

  const out = await supabaseGateway.listExpenseEntries({
    ym,
    status: normalizedStatus,
    cost_center: normalizedCenter,
  });

  return {
    rows: Array.isArray(out?.rows) ? out.rows : [],
    kpis: out?.kpis ?? { total: 0, paid: 0, pending: 0, overdue: 0 },
  };
}

async function createOneOffExpense({
  date,
  amount,
  title,
  category = null,
  cost_center = "PJ",
}: {
  date: string;
  amount: number;
  title: string;
  category?: string | null;
  cost_center?: string;
}) {
  return createExpenseEntry({
    due_date: date,
    amount,
    description: title,
    category,
    cost_center,
  } as Dict);
}

async function createExpenseEntry(payload: Dict) {
  return supabaseGateway.createExpenseEntry(payload as unknown as Parameters<typeof supabaseGateway.createExpenseEntry>[0]);
}
async function markExpensePaid(id: string) {
  return supabaseGateway.markExpensePaid(id);
}
async function cancelExpense(id: string, note: string | null = null) {
  return supabaseGateway.cancelExpense(id, note);
}
async function reopenExpense(id: string) {
  return supabaseGateway.reopenExpense(id);
}

async function previewGenerateExpenses({
  ym,
  cost_center = null,
}: { ym?: string; cost_center?: string | null } = {}) {
  const preview = await supabaseGateway.previewGenerateExpenses({ ym, cost_center: null });
  if (!cost_center || cost_center === "all") return preview;
  return (preview || []).filter(
    (p: Dict) => (p.cost_center || "PJ") === cost_center,
  );
}
async function generateExpenses({ ym, cost_center = null }: { ym?: string; cost_center?: string | null } = {}) {
  return supabaseGateway.generateExpenses({ ym, cost_center });
}

// ---------- Outras Receitas ----------
async function listOtherRevenues({
  ym,
  status = "all",
  cost_center = null,
}: { ym?: string; status?: string; cost_center?: string | null } = {}) {
  return supabaseGateway.listOtherRevenues({ ym, status, cost_center });
}
async function createOtherRevenue(payload: Dict) {
  return supabaseGateway.createOtherRevenue(payload);
}
interface InstallmentsArgs {
  ym: string;
  title: string;
  amount: number;
  total_installments: number;
  due_day?: number;
  category?: string | null;
  cost_center?: string;
}
async function createOtherRevenueInstallments({
  ym,
  title,
  amount,
  total_installments,
  due_day = 5,
  category = null,
  cost_center = "extra",
}: InstallmentsArgs) {
  const n = Math.max(1, Number(total_installments || 1));
  const results = [];
  const addMonth = (ymStr: string, offset: number) => {
    const [Y, M] = ymStr.split("-").map(Number);
    const date = new Date(Y, M - 1 + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  for (let i = 0; i < n; i++) {
    const currYm = addMonth(ym, i);
    const due_date = `${currYm}-${String(due_day).padStart(2, "0")}`;
    const row = await supabaseGateway.createOtherRevenue({
      ym: currYm,
      title: `${title} (${i + 1}/${n})`,
      amount,
      due_date,
      category,
      cost_center,
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
async function markOtherRevenuePaid(id: string) {
  return supabaseGateway.markOtherRevenuePaid(id);
}
async function cancelOtherRevenue(id: string, note: string | null = null) {
  return supabaseGateway.cancelOtherRevenue(id, note);
}
async function reopenOtherRevenue(id: string) {
  return supabaseGateway.reopenOtherRevenue(id);
}
async function updateOtherRevenue(id: string, changes: Dict = {}, opts: Dict = {}) {
  return supabaseGateway.updateOtherRevenue(id, changes, opts);
}
async function cancelOtherRevenueSeriesFrom(id: string, note: string | null = null) {
  return supabaseGateway.cancelOtherRevenueSeriesFrom(id, note);
}
async function ensureOtherRevenuesForMonth(ym: string) {
  return supabaseGateway.ensureOtherRevenuesForMonth(ym);
}
async function deleteOtherRevenue(id: string) {
  return supabaseGateway.deleteOtherRevenue(id);
}
async function deleteOtherRevenueSeriesFrom(id: string) {
  return supabaseGateway.deleteOtherRevenueSeriesFrom(id);
}
async function createOtherRevenueTemplate(payload: Dict) {
  return supabaseGateway.createOtherRevenueTemplate(payload);
}

// ---------- Professores (payout) ----------
async function sumTeacherPayoutByMonth(teacherId: string, ym: string) {
  return supabaseGateway.sumTeacherPayoutByMonth(teacherId, ym);
}
async function listTeacherSessionsByMonth(teacherId: string, ym: string) {
  return supabaseGateway.listTeacherSessionsByMonth(teacherId, ym);
}
async function updateTeacher(id: string, changes: UpdateTeacherPayload = {}) {
  return supabaseGateway.updateTeacher(id, changes);
}
async function createTeacher(payload: CreateTeacherPayload) {
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
async function setStudentStatus(id: string, status: "ativo" | "inativo") {
  return supabaseGateway.setStudentStatus(id, status);
}
async function listTurmaMembers(turmaId: string) {
  return supabaseGateway.listTurmaMembers(turmaId);
}
async function listAttendanceByStudent(studentId: string) {
  return supabaseGateway.listAttendanceByStudent(studentId);
}
async function updateStudent(id: string, changes: Dict = {}) {
  return supabaseGateway.updateStudent(id, changes);
}
async function createStudent(payload: Dict) {
  return supabaseGateway.createStudent(payload as unknown as Parameters<typeof supabaseGateway.createStudent>[0]);
}
async function deleteStudent(id: string) {
  return supabaseGateway.deleteStudent(id);
}

// --- Pagadores ---
async function listPayers(opts: Dict = {}) {
  return supabaseGateway.listPayers(opts);
}
async function createPayer(payload: Dict) {
  return supabaseGateway.createPayer(payload as unknown as Parameters<typeof supabaseGateway.createPayer>[0]);
}
async function updatePayer(id: string, changes: Dict = {}) {
  return supabaseGateway.updatePayer(id, changes);
}
async function deletePayer(id: string) {
  return supabaseGateway.deletePayer(id);
}

// ---------- Agenda ----------
async function createSession(payload: Dict) {
  return supabaseGateway.createSession(payload);
}
async function listSessionsWithAttendance({ turmaId, start, end }: { turmaId: string; start: string; end: string }) {
  return supabaseGateway.listSessionsWithAttendance({ turmaId, start, end });
}
async function listSessions(turmaId: string) {
  return supabaseGateway.listSessions(turmaId);
}
async function updateSession(id: string, changes: Dict = {}) {
  return supabaseGateway.updateSession(id, changes);
}
async function deleteSession(id: string) {
  return supabaseGateway.deleteSession(id);
}
async function listAttendance(sessionId: string) {
  return supabaseGateway.listAttendance(sessionId);
}
async function upsertAttendance(sessionId: string, studentId: string, payload: Dict) {
  return supabaseGateway.upsertAttendance(sessionId, studentId, payload as unknown as Parameters<typeof supabaseGateway.upsertAttendance>[2]);
}
async function deleteAttendance(sessionId: string, studentId: string) {
  return supabaseGateway.deleteAttendance(sessionId, studentId);
}

// ---------- Financeiro: mensalidades (geração) ----------
async function previewGenerateMonth({ ym }: { ym: string }) {
  return supabaseGateway.previewGenerateMonth({ ym });
}
async function generateMonth({ ym }: { ym: string }) {
  return supabaseGateway.generateMonth({ ym });
}
async function deleteExpenseEntry(id: string, _opts?: Dict) {
  return (supabaseGateway as unknown as { deleteExpenseEntry: (_: string) => Promise<unknown> }).deleteExpenseEntry(id);
}
async function createTurma(payload: Dict) {
  return supabaseGateway.createTurma(payload);
}
async function updateTurma(id: string, changes: Dict = {}) {
  return supabaseGateway.updateTurma(id, changes);
}
async function deleteTurma(id: string) {
  return supabaseGateway.deleteTurma(id);
}

// ---------- Turmas: vínculos aluno–turma ----------
async function addStudentToTurma(turmaId: string, studentId: string) {
  return supabaseGateway.addStudentToTurma(turmaId, studentId);
}
async function removeStudentFromTurma(turmaId: string, studentId: string) {
  return supabaseGateway.removeStudentFromTurma(turmaId, studentId);
}

export const financeGateway = {
  // Receitas (mensalidades)
  listPayments,
  markPaid,
  cancelPayment,
  reopenPayment,
  previewGenerateMonth,
  generateMonth,

  // KPIs / Sumário
  getMonthlySummary,
  getMonthlyFinancialSummary,
  getMonthlyFinanceKpis,
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
  createExpenseCategory: (payload: Dict) => supabaseGateway.createExpenseCategory(payload as unknown as Parameters<typeof supabaseGateway.createExpenseCategory>[0]),
  updateExpenseCategory: (id: string, changes: Dict) => supabaseGateway.updateExpenseCategory(id, changes),
  deleteExpenseCategory: (id: string) => supabaseGateway.deleteExpenseCategory(id),

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

import { describe, it, expect, vi } from "vitest";
import { createSupabaseMock } from "./supabaseMock";

const mock = createSupabaseMock();
vi.mock("@/lib/supabaseClient", () => ({ supabase: mock }));

const { supabaseGateway } = await import("../../supabaseGateway");

describe("barrel re-export (supabaseGateway)", () => {
  it("exports getTenantId", () => {
    expect(typeof supabaseGateway.getTenantId).toBe("function");
  });

  // Students
  it("exports student methods", () => {
    expect(typeof supabaseGateway.listStudents).toBe("function");
    expect(typeof supabaseGateway.createStudent).toBe("function");
    expect(typeof supabaseGateway.updateStudent).toBe("function");
    expect(typeof supabaseGateway.setStudentStatus).toBe("function");
    expect(typeof supabaseGateway.deleteStudent).toBe("function");
    expect(typeof supabaseGateway.listAttendanceByStudent).toBe("function");
  });

  // Teachers
  it("exports teacher methods", () => {
    expect(typeof supabaseGateway.listTeachers).toBe("function");
    expect(typeof supabaseGateway.createTeacher).toBe("function");
    expect(typeof supabaseGateway.updateTeacher).toBe("function");
    expect(typeof supabaseGateway.setTeacherStatus).toBe("function");
    expect(typeof supabaseGateway.deleteTeacher).toBe("function");
    expect(typeof supabaseGateway.sumTeacherPayoutByMonth).toBe("function");
    expect(typeof supabaseGateway.listTeacherSessionsByMonth).toBe("function");
  });

  // Payers
  it("exports payer methods", () => {
    expect(typeof supabaseGateway.listPayers).toBe("function");
    expect(typeof supabaseGateway.createPayer).toBe("function");
    expect(typeof supabaseGateway.updatePayer).toBe("function");
    expect(typeof supabaseGateway.deletePayer).toBe("function");
  });

  // Turmas
  it("exports turma methods", () => {
    expect(typeof supabaseGateway.listTurmas).toBe("function");
    expect(typeof supabaseGateway.createTurma).toBe("function");
    expect(typeof supabaseGateway.updateTurma).toBe("function");
    expect(typeof supabaseGateway.deleteTurma).toBe("function");
    expect(typeof supabaseGateway.listTurmaMembers).toBe("function");
    expect(typeof supabaseGateway.countStudentsInTurma).toBe("function");
    expect(typeof supabaseGateway.addStudentToTurma).toBe("function");
    expect(typeof supabaseGateway.removeStudentFromTurma).toBe("function");
  });

  // Sessions & Attendance
  it("exports session/attendance methods", () => {
    expect(typeof supabaseGateway.listSessions).toBe("function");
    expect(typeof supabaseGateway.listSessionsWithAttendance).toBe("function");
    expect(typeof supabaseGateway.createSession).toBe("function");
    expect(typeof supabaseGateway.updateSession).toBe("function");
    expect(typeof supabaseGateway.deleteSession).toBe("function");
    expect(typeof supabaseGateway.createOneOffSession).toBe("function");
    expect(typeof supabaseGateway.listAttendance).toBe("function");
    expect(typeof supabaseGateway.upsertAttendance).toBe("function");
    expect(typeof supabaseGateway.deleteAttendance).toBe("function");
    expect(typeof supabaseGateway.ensureSessionsFromRules).toBe("function");
    expect(typeof supabaseGateway.pruneSessionsNotInRules).toBe("function");
    expect(typeof supabaseGateway.generateSessionsForTurma).toBe("function");
  });

  // Payments (mensalidades)
  it("exports payment methods", () => {
    expect(typeof supabaseGateway.previewGenerateMonth).toBe("function");
    expect(typeof supabaseGateway.generateMonth).toBe("function");
    expect(typeof supabaseGateway.listPayments).toBe("function");
    expect(typeof supabaseGateway.markPaid).toBe("function");
    expect(typeof supabaseGateway.cancelPayment).toBe("function");
    expect(typeof supabaseGateway.reopenPayment).toBe("function");
  });

  // Expenses
  it("exports expense methods", () => {
    expect(typeof supabaseGateway.listExpenseTemplates).toBe("function");
    expect(typeof supabaseGateway.createExpenseTemplate).toBe("function");
    expect(typeof supabaseGateway.updateExpenseTemplate).toBe("function");
    expect(typeof supabaseGateway.deleteExpenseTemplate).toBe("function");
    expect(typeof supabaseGateway.listExpenseEntries).toBe("function");
    expect(typeof supabaseGateway.createExpenseEntry).toBe("function");
    expect(typeof supabaseGateway.createOneOffExpense).toBe("function");
    expect(typeof supabaseGateway.markExpensePaid).toBe("function");
    expect(typeof supabaseGateway.cancelExpense).toBe("function");
    expect(typeof supabaseGateway.reopenExpense).toBe("function");
    expect(typeof supabaseGateway.previewGenerateExpenses).toBe("function");
    expect(typeof supabaseGateway.generateExpenses).toBe("function");
    expect(typeof supabaseGateway.listExpenseCategories).toBe("function");
    expect(typeof supabaseGateway.createExpenseCategory).toBe("function");
    expect(typeof supabaseGateway.updateExpenseCategory).toBe("function");
    expect(typeof supabaseGateway.deleteExpenseCategory).toBe("function");
  });

  // Other Revenues
  it("exports other revenue methods", () => {
    expect(typeof supabaseGateway.createOtherRevenueTemplate).toBe("function");
    expect(typeof supabaseGateway.ensureOtherRevenuesForMonth).toBe("function");
    expect(typeof supabaseGateway.listOtherRevenues).toBe("function");
    expect(typeof supabaseGateway.createOtherRevenue).toBe("function");
    expect(typeof supabaseGateway.markOtherRevenuePaid).toBe("function");
    expect(typeof supabaseGateway.cancelOtherRevenue).toBe("function");
    expect(typeof supabaseGateway.reopenOtherRevenue).toBe("function");
    expect(typeof supabaseGateway.cancelOtherRevenueSeriesFrom).toBe("function");
    expect(typeof supabaseGateway.deleteOtherRevenue).toBe("function");
    expect(typeof supabaseGateway.deleteOtherRevenueSeriesFrom).toBe("function");
    expect(typeof supabaseGateway.updateOtherRevenue).toBe("function");
  });

  // Finance KPIs
  it("exports finance KPI methods", () => {
    expect(typeof supabaseGateway.getMonthlyFinanceKpis).toBe("function");
    expect(typeof supabaseGateway.reportReceivablesAging).toBe("function");
    expect(typeof supabaseGateway.getCombinedRevenueKpis).toBe("function");
    expect(typeof supabaseGateway.getMonthlyFinancialSummary).toBe("function");
  });

  // Settings
  it("exports settings methods", () => {
    expect(typeof supabaseGateway.getTenantSettings).toBe("function");
    expect(typeof supabaseGateway.upsertTenantSettings).toBe("function");
  });
});

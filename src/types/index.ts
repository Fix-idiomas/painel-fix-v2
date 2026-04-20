// ─── Shared primitives ────────────────────────────────────────────────────────

export type StudentStatus = "ativo" | "inativo";
export type TeacherStatus = "ativo" | "inativo";
export type PaymentStatus = "pending" | "paid" | "canceled";
export type ExpenseStatus = "pending" | "paid" | "canceled";
export type RateMode = "flat" | "by_size";
export type RecurrenceMode = "indefinite" | "installments" | "until_month";

// ─── Students ─────────────────────────────────────────────────────────────────

export interface Student {
  id: string;
  name: string;
  status: StudentStatus;
  monthly_value: number;
  due_day: number;
  birth_date: string | null;
  payer_id: string | null;
  email: string | null;
  endereco: string | null;
  cpf: string | null;
  photo_url: string | null;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateStudentPayload {
  name: string;
  monthly_value?: number;
  due_day?: number;
  birth_date?: string | null;
  status?: StudentStatus;
  payer_id?: string | null;
  email?: string | null;
  endereco?: string | null;
  cpf?: string | null;
}

export interface UpdateStudentPayload {
  name?: string;
  monthly_value?: number;
  due_day?: number;
  birth_date?: string | null;
  payer_id?: string | null;
  email?: string | null;
  endereco?: string | null;
  cpf?: string | null;
  photo_url?: string | null;
}

export interface AttendanceRecord {
  key: string;
  session_id: string;
  student_id: string;
  present: boolean;
  note: string | null;
  created_at: string | null;
  updated_at: string | null;
  tenant_id: string | null;
  session_date_snapshot: string | null;
  turma_name_snapshot: string | null;
}

// ─── Teachers ─────────────────────────────────────────────────────────────────

export interface RateRule {
  min: number | null;
  max: number | null;
  hourly_rate: number;
}

export interface Teacher {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  user_id?: string | null;
  status: TeacherStatus;
  hourly_rate: number;
  pay_day: number;
  rate_mode: RateMode;
  rate_rules: RateRule[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateTeacherPayload {
  name: string;
  email?: string | null;
  phone?: string | null;
  status?: TeacherStatus;
  hourly_rate?: number;
  pay_day?: number;
  rate_mode?: RateMode;
  rate_rules?: RateRule[];
}

export interface UpdateTeacherPayload {
  name?: string;
  email?: string | null;
  phone?: string | null;
  status?: TeacherStatus;
  hourly_rate?: number;
  pay_day?: number;
  rate_mode?: RateMode;
  rate_rules?: RateRule[];
}

export interface TeacherPayout {
  hours: number;
  sessions: number;
  amount: number;
  hourly_rate: number;
  pay_day: number;
}

export interface TeacherSessionRow {
  id: string;
  date: string | null;
  turma_id: string;
  turma_name: string;
  duration_hours: number;
  headcount_snapshot: number | null;
  hourly_applied: number;
  amount: number;
}

// ─── Payers ───────────────────────────────────────────────────────────────────

export interface Payer {
  id: string;
  name: string;
  email: string | null;
  created_at?: string;
}

// ─── Turmas (Classes) ─────────────────────────────────────────────────────────

export interface MeetingRule {
  weekday: number | null;
  time: string | null;
  duration_hours: number;
}

export interface Turma {
  id: string;
  name: string;
  teacher_id: string | null;
  status: "ativo" | "inativo";
  start_date: string | null;
  meeting_rules: MeetingRule[];
  tenant_id?: string;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  turma_id: string;
  date: string;
  duration_hours: number;
  headcount_snapshot: number | null;
  teacher_id_snapshot: string | null;
  status: string;
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  student_id: string | null;
  payer_id: string | null;
  student_name_snapshot: string | null;
  payer_name_snapshot: string | null;
  amount: number;
  due_date: string;
  paid_date: string | null;
  competence_month: string;
  status: PaymentStatus;
  days_overdue?: number;
  tenant_id?: string;
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export interface Expense {
  id: string;
  title_snapshot: string | null;
  description?: string | null;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: ExpenseStatus;
  cost_center: string | null;
  payer_name_snapshot?: string | null;
  tenant_id?: string;
}

// ─── Other Revenues ───────────────────────────────────────────────────────────

export interface OtherRevenueTemplate {
  id: string;
  title: string;
  amount: number;
  start_month: string;
  end_month: string | null;
  installments: number | null;
  recurrence_mode: RecurrenceMode;
  tenant_id?: string;
}

export interface RecurrenceTemplate {
  recurrence_mode?: string | null;
  start_month?: string | null;
  end_month?: string | null;
  installments?: number | null;
}

// ─── Tenant Settings ──────────────────────────────────────────────────────────

export interface TenantSettings {
  brand_name: string | null;
  logo_url: string | null;
  subtitle: string | null;
  nav_layout: string | null;
  sidebar_width: number | null;
  header_density: string | null;
  theme: Record<string, unknown>;
  nav_overrides: unknown[];
}

// ─── Finance KPIs ─────────────────────────────────────────────────────────────

export interface RevenueKpis {
  total_billed: number;
  paid: number;
  pending: number;
  overdue: number;
}

export interface ExpenseKpis {
  total: number;
  paid: number;
  pending: number;
  overdue: number;
}

export interface CostCenterKpis {
  cost_center: string;
  total: number;
  paid: number;
  pending: number;
  overdue: number;
}

export interface MonthlyFinanceKpis {
  revenue: RevenueKpis;
  expense: ExpenseKpis;
  net: number;
  by_cost_center: CostCenterKpis[];
}

export interface CombinedRevenueKpis {
  total: number;
  received: number;
  upcoming: number;
  overdue: number;
}

export interface FinancialSummary {
  receita: number;
  despesas: number;
  professores: number;
  saldo: number;
  saldo_operacional: number;
  despesas_pj: number;
  despesas_pf: number;
  by_cost_center: CostCenterKpis[];
}

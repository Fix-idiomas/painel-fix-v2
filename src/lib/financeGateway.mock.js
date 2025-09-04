const STORE_KEY = "__fix_finance_mock__";

function loadStore() {
  if (typeof window === "undefined") {
    return {
      students: [],
      payers: [],
      payments: [],
      teachers: [],
      turmas: [],
      turma_members: [], // {turma_id, student_id}
      sessions: [], // {id, turma_id, date, notes}
      attendance: [], // {id, session_id, turma_id, student_id, present, note, snapshots...}
    };
  }
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw)
      return {
        students: [],
        payers: [],
        payments: [],
        teachers: [],
        turmas: [],
        turma_members: [],
        sessions: [],
        attendance: [],
      };
    const d = JSON.parse(raw);
    return {
      students: d.students ?? [],
      payers: d.payers ?? [],
      payments: d.payments ?? [],
      teachers: d.teachers ?? [],
      turmas: d.turmas ?? [],
      turma_members: d.turma_members ?? [],
      sessions: d.sessions ?? [],
      attendance: d.attendance ?? [],
    };
  } catch {
    return {
      students: [],
      payers: [],
      payments: [],
      teachers: [],
      turmas: [],
      turma_members: [],
      sessions: [],
      attendance: [],
    };
  }
}

function saveStore(state) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      students: state.students ?? [],
      payers: state.payers ?? [],
      payments: state.payments ?? [],
      teachers: state.teachers ?? [],
      turmas: state.turmas ?? [],
      turma_members: state.turma_members ?? [],
      sessions: state.sessions ?? [],
      attendance: state.attendance ?? [],
    })
  );
}

// estado em memória
let {
  students: _students,
  payers: _payers,
  payments: _payments,
  teachers: _teachers,
  turmas: _turmas,
  turma_members: _turma_members,
  sessions: _sessions,
  attendance: _attendance,
} = loadStore();

const uid = (p = "id_") => p + Math.random().toString(36).slice(2, 10);

// ----------------- Helpers -----------------
function persist() {
  saveStore({
    students: _students,
    payers: _payers,
    payments: _payments,
    teachers: _teachers,
    turmas: _turmas,
    turma_members: _turma_members,
    sessions: _sessions,
    attendance: _attendance,
  });
}

// ----------------- Students -----------------
async function listStudents() {
  return _students.slice();
}

async function createStudent({ name, monthly_value, due_day, birth_date = null, status = "ativo", payer_id = null }) {
  if (!name || monthly_value == null || due_day == null)
    throw new Error("Obrigatórios: name, monthly_value, due_day");
  const b = birth_date && /^\d{4}-\d{2}-\d{2}$/.test(birth_date) ? birth_date : null;
  const st = {
    id: uid("stu_"),
    name: String(name),
    monthly_value: Number(monthly_value) || 0,
    due_day: Math.min(Math.max(Number(due_day) || 5, 1), 28),
    status, // "ativo" | "inativo"
    payer_id: payer_id || null,
    birth_date: b,
  };
  _students.push(st);
  persist();
  return st;
}

async function updateStudent(id, changes) {
  const s = _students.find((x) => x.id === id);
  if (!s) throw new Error("Aluno não encontrado");
  if (changes.name != null) s.name = String(changes.name);
  if (changes.monthly_value != null) s.monthly_value = Number(changes.monthly_value) || 0;
  if (changes.due_day != null) s.due_day = Math.min(Math.max(Number(changes.due_day) || 5, 1), 28);
  if (changes.birth_date !== undefined) {
    s.birth_date =
      changes.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(changes.birth_date)
        ? changes.birth_date
        : null;
  }
  if (changes.payer_id !== undefined) s.payer_id = changes.payer_id || null;
  persist();
  return s;
}

async function setStudentStatus(id, status) {
  const s = _students.find((x) => x.id === id);
  if (!s) throw new Error("Aluno não encontrado");
  s.status = status;
  persist();
  return s;
}

async function deleteStudent(id) {
  // mantém pagamentos "paid" (com snapshots),
  // remove "pending/canceled" do aluno.
  _payments = _payments.filter((p) => !(p.student_id === id && p.status !== "paid"));
  // não apagar attendance (histórico do aluno)
  // remove vínculo com turmas
  _turma_members = _turma_members.filter((tm) => tm.student_id !== id);
  // remove aluno
  _students = _students.filter((x) => x.id !== id);
  persist();
  return true;
}

// ----------------- Payers (mínimo) -----------------
async function listPayers() { return _payers.slice(); }
async function createPayer({ name, email = null }) {
  if (!name) throw new Error("Nome é obrigatório");
  const py = { id: uid("pay_"), name: String(name), email: email || null, created_at: new Date().toISOString() };
  _payers.push(py);
  persist();
  return py;
}

// ----------------- Teachers (mínimo) -----------------
// ----------------- Teachers -----------------
async function listTeachers() {
  return _teachers.map((t) => ({
    ...t,
    hourly_rate: Number(t.hourly_rate ?? 0),
    pay_day: Math.min(Math.max(Number(t.pay_day ?? 5), 1), 28),
  }));
}

async function createTeacher({
  name,
  email = null,
  phone = null,
  status = "ativo",
  hourly_rate = 0,
  pay_day = 5,
}) {
  if (!name) throw new Error("Nome é obrigatório");
  const t = {
    id: uid("tch_"),
    name: String(name),
    email: email || null,
    phone: phone || null,
    status, // "ativo" | "inativo"
    hourly_rate: Number(hourly_rate || 0), // R$/hora
    pay_day: Math.min(Math.max(Number(pay_day || 5), 1), 28), // 1..28
    created_at: new Date().toISOString(),
  };
  _teachers.push(t);
  persist();
  return t;
}

async function updateTeacher(id, changes) {
  const t = _teachers.find((x) => x.id === id);
  if (!t) throw new Error("Professor não encontrado");
  if (changes.name != null) t.name = String(changes.name);
  if (changes.email !== undefined) t.email = changes.email || null;
  if (changes.phone !== undefined) t.phone = changes.phone || null;
  if (changes.status != null) t.status = changes.status; // "ativo" | "inativo"
  if (changes.hourly_rate !== undefined) t.hourly_rate = Number(changes.hourly_rate || 0);
  if (changes.pay_day !== undefined)
    t.pay_day = Math.min(Math.max(Number(changes.pay_day || 5), 1), 28);
  persist();
  return t;
}

// ----------------- Turmas -----------------
async function listTurmas() { return _turmas.slice(); }

async function createTurma({ name, teacher_id = null, capacity = 20 }) {
  if (!name) throw new Error("Nome da turma é obrigatório");
  const t = { id: uid("tur_"), name: String(name), teacher_id: teacher_id || null, capacity: Number(capacity || 20), created_at: new Date().toISOString() };
  _turmas.push(t);
  persist();
  return t;
}

async function updateTurma(id, changes) {
  const t = _turmas.find((x) => x.id === id);
  if (!t) throw new Error("Turma não encontrada");
  if (changes.name != null) t.name = String(changes.name);
  if (changes.teacher_id !== undefined) t.teacher_id = changes.teacher_id || null;
  if (changes.capacity != null) t.capacity = Number(changes.capacity || 20);
  persist();
  return t;
}

async function deleteTurma(id) {
  // remover membros, sessões e attendance ligados à turma
  const sessIds = _sessions.filter(s => s.turma_id === id).map(s => s.id);
  _attendance = _attendance.filter(a => !sessIds.includes(a.session_id));
  _sessions = _sessions.filter(s => s.turma_id !== id);
  _turma_members = _turma_members.filter(tm => tm.turma_id !== id);
  _turmas = _turmas.filter(t => t.id !== id);
  persist();
  return true;
}

async function listTurmaMembers(turma_id) {
  const ids = new Set(_turma_members.filter(tm => tm.turma_id === turma_id).map(tm => tm.student_id));
  return _students.filter(s => ids.has(s.id)).map(s => ({ id: s.id, name: s.name, status: s.status }));
}

async function addStudentToTurma(turma_id, student_id) {
  const exists = _turma_members.some(tm => tm.turma_id === turma_id && tm.student_id === student_id);
  if (exists) return;
  _turma_members.push({ turma_id, student_id });
  persist();
}

async function removeStudentFromTurma(turma_id, student_id) {
  _turma_members = _turma_members.filter(tm => !(tm.turma_id === turma_id && tm.student_id === student_id));
  // NÃO apagar attendance — histórico deve permanecer
  persist();
}

// ----------------- Sessões -----------------
// ----------------- Sessões -----------------
async function listSessions(turma_id) {
  return _sessions
    .filter((s) => s.turma_id === turma_id)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

async function createSession({ turma_id, date, notes = "", duration_hours = 1 }) {
  if (!turma_id) throw new Error("turma_id é obrigatório");
  if (!date) throw new Error("date é obrigatório (yyyy-mm-dd)");
  const s = {
    id: uid("ses_"),
    turma_id,
    date,
    notes: notes || "",
    duration_hours: Math.max(0, Number(duration_hours || 0.5)), // horas
    created_at: new Date().toISOString(),
  };
  _sessions.push(s);
  persist();
  return s;
}

async function updateSession(id, changes) {
  const s = _sessions.find((x) => x.id === id);
  if (!s) throw new Error("Sessão não encontrada");
  if (changes.date != null) s.date = changes.date;
  if (changes.notes != null) s.notes = changes.notes;
  if (changes.duration_hours !== undefined)
    s.duration_hours = Math.max(0, Number(changes.duration_hours || 0));
  persist();
  return s;
}

async function deleteSession(id) {
  _sessions = _sessions.filter((x) => x.id !== id);
  // apaga também attendance dessa sessão (se usar essa coleção)
  _attendance = _attendance.filter((a) => a.session_id !== id);
  persist();
  return true;
}
// ----------------- Payout de Professor -----------------
async function listTeacherSessionsByMonth(teacher_id, ym) {
  const ymKey = (ym || "").slice(0, 7);
  if (!teacher_id || ymKey.length !== 7) return [];

  const myTurmas = _turmas.filter((t) => t.teacher_id === teacher_id).map((t) => t.id);
  if (myTurmas.length === 0) return [];

  const rows = _sessions.filter((s) => {
    if (!myTurmas.includes(s.turma_id)) return false;
    const month = (s.date || "").slice(0, 7);
    return month === ymKey;
  });

  return rows.map((s) => ({
    id: s.id,
    turma_id: s.turma_id,
    date: s.date,
    notes: s.notes || "",
    duration_hours: Number(s.duration_hours || 0),
  }));
}

async function sumTeacherPayoutByMonth(teacher_id, ym) {
  const t = _teachers.find((x) => x.id === teacher_id);
  if (!t)
    return { hours: 0, sessions: 0, amount: 0, hourly_rate: 0, pay_day: 5 };

  const hourly_rate = Number(t.hourly_rate || 0);
  const pay_day = Math.min(Math.max(Number(t.pay_day ?? 5), 1), 28);

  const sessions = await listTeacherSessionsByMonth(teacher_id, ym);
  const hours = sessions.reduce(
    (acc, s) => acc + Number(s.duration_hours || 0),
    0
  );
  const amount = hours * hourly_rate;

  return { hours, sessions: sessions.length, amount, hourly_rate, pay_day };
}

// ----------------- Attendance (snapshots) -----------------
async function listAttendance(session_id) {
  return _attendance.filter(a => a.session_id === session_id);
}

async function upsertAttendance(session_id, student_id, { present, note }) {
  const s = _sessions.find(x => x.id === session_id);
  if (!s) throw new Error("Sessão não encontrada");
  const stu = _students.find(x => x.id === student_id) || null;
  const turma = _turmas.find(x => x.id === s.turma_id) || null;

  let row = _attendance.find(a => a.session_id === session_id && a.student_id === student_id);
  if (!row) {
    row = {
      id: uid("att_"),
      session_id,
      turma_id: s.turma_id,
      student_id,
      // snapshots:
      student_name_snapshot: stu?.name || "(Aluno removido)",
      turma_name_snapshot: turma?.name || "(Turma removida)",
      session_date_snapshot: s.date, // yyyy-mm-dd
      created_at: new Date().toISOString(),
    };
    _attendance.push(row);
  }
  row.present = !!present;
  row.note = note || "";
  row.updated_at = new Date().toISOString();

  persist();
  return row;
}

async function listAttendanceByStudent(student_id) {
  return _attendance
    .filter(a => a.student_id === student_id)
    .sort((a,b) => (b.session_date_snapshot||"").localeCompare(a.session_date_snapshot||""));
}

// ----------------- Financeiro (mínimo para sua tela atual) -----------------
const isoMonthStart = (ym) => (ym.length === 7 ? ym + "-01" : ym).slice(0, 10);
const calcDueDate = (ym) => {
  const d = new Date(ym.length === 7 ? ym + "-01" : ym);
  const yyyy = d.getUTCFullYear();
  const mm = d.getUTCMonth() + 1;
  return (due_day) => {
    const day = Math.min(Math.max(Number(due_day || 5), 1), 28);
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
};

function ensurePayerForStudent(s) {
  if (s.payer_id) return s.payer_id;
  const id = uid("pay_");
  _payers.push({ id, name: s.name, email: null, created_at: new Date().toISOString() });
  s.payer_id = id;
  persist();
  return id;
}

async function previewGenerateMonth({ ym }) {
  const monthStart = isoMonthStart(ym);
  const due = calcDueDate(ym);
  return _students
    .filter((s) => s.status === "ativo" && (Number(s.monthly_value) || 0) > 0)
    .map((s) => {
      const payerId = ensurePayerForStudent(s);
      const exists = _payments.some((p) => p.student_id === s.id && p.competence_month === monthStart);
      if (exists) return null;
      return {
        student_id: s.id,
        payer_id: payerId,
        competence_month: monthStart,
        due_date: due(s.due_day),
        amount: Number(s.monthly_value) || 0,
        status: "pending",
      };
    })
    .filter(Boolean);
}

async function generateMonth({ ym }) {
  const monthStart = isoMonthStart(ym);
  const due = calcDueDate(ym);
  const inserted = [];
  _students
    .filter((s) => s.status === "ativo" && (Number(s.monthly_value) || 0) > 0)
    .forEach((s) => {
      const already = _payments.some((p) => p.student_id === s.id && p.competence_month === monthStart);
      if (already) return;

      const payerId = ensurePayerForStudent(s);
      const py = _payers.find((x) => x.id === payerId);

      const row = {
        id: uid("paym_"),
        student_id: s.id,
        payer_id: payerId,
        competence_month: monthStart,
        due_date: due(s.due_day),
        amount: Number(s.monthly_value) || 0,
        status: "pending",
        paid_at: null,
        canceled_at: null,
        cancel_note: null,
        created_at: new Date().toISOString(),
        student_name_snapshot: s.name,
        payer_name_snapshot: (py && py.name) || s.name,
      };
      _payments.push(row);
      inserted.push(row);
    });
  persist();
  return inserted;
}

async function listPayments({ ym, status }) {
  const monthStart = ym ? isoMonthStart(ym) : null;
  const today = new Date().toISOString().slice(0, 10);

  const rows = _payments
    .map((p) => {
      const s = _students.find((x) => x.id === p.student_id);
      const py = _payers.find((x) => x.id === p.payer_id);
      const student_name = s?.name ?? p.student_name_snapshot ?? "(Aluno removido)";
      const payer_name = py?.name ?? p.payer_name_snapshot ?? p.student_name_snapshot ?? student_name;
      const overdue =
        p.status === "pending" && p.due_date < today
          ? Math.max(0, Math.floor((new Date(today) - new Date(p.due_date)) / 86400000))
          : 0;

      return {
        payment_id: p.id,
        student_id: p.student_id,
        student_name,
        payer_id: p.payer_id,
        payer_name,
        competence_month: p.competence_month,
        due_date: p.due_date,
        amount: p.amount,
        status: p.status,
        days_overdue: overdue,
        paid_at: p.paid_at,
        canceled_at: p.canceled_at,
        cancel_note: p.cancel_note,
        created_at: p.created_at,
      };
    })
    .filter((r) => (monthStart ? r.competence_month === monthStart : true))
    .filter((r) => (status && status !== "all" ? r.status === status : true));

  const sum = (arr) => arr.reduce((a, b) => a + Number(b.amount || 0), 0);
  return {
    rows,
    kpis: {
      total_billed: sum(rows),
      total_paid: sum(rows.filter((r) => r.status === "paid")),
      total_pending: sum(rows.filter((r) => r.status === "pending")),
      total_overdue: sum(rows.filter((r) => r.status === "pending" && r.days_overdue > 0)),
    },
  };
}

async function markPaid(id) {
  const p = _payments.find((x) => x.id === id);
  if (!p) throw new Error("Pagamento não encontrado");
  p.status = "paid";
  p.paid_at = new Date().toISOString();
  p.canceled_at = null;
  p.cancel_note = null;
  persist();
}

async function cancelPayment(id, note) {
  const p = _payments.find((x) => x.id === id);
  if (!p) throw new Error("Pagamento não encontrado");
  p.status = "canceled";
  p.canceled_at = new Date().toISOString();
  p.cancel_note = note || null;
  p.paid_at = null;
  persist();
}

async function reopenPayment(id) {
  const p = _payments.find((x) => x.id === id);
  if (!p) throw new Error("Pagamento não encontrado");
  p.status = "pending";
  p.paid_at = null;
  p.canceled_at = null;
  p.cancel_note = null;
  persist();
}

// ----------------- Export -----------------
export const financeGateway = {
  // alunos
  listStudents,
  createStudent,
  updateStudent,
  setStudentStatus,
  deleteStudent,

  // pagadores
  listPayers,
  createPayer,

  // professores
  listTeachers,
  createTeacher,
  updateTeacher,

  // turmas
  listTurmas,
  createTurma,
  updateTurma,
  deleteTurma,
  listTurmaMembers,
  addStudentToTurma,
  removeStudentFromTurma,

  // sessões
  listSessions,
  createSession,
  updateSession,
  deleteSession,

  // attendance
  listAttendance,
  upsertAttendance,
  listAttendanceByStudent,

  // financeiro
  previewGenerateMonth,
  generateMonth,
  listPayments,
  markPaid,
  cancelPayment,
  reopenPayment,

  //novas funções
  listTeacherSessionsByMonth,
  sumTeacherPayoutByMonth,

  // util
  isAdmin: async () => true,
  __reset: async () => {
    _students = [];
    _payers = [];
    _payments = [];
    _teachers = [];
    _turmas = [];
    _turma_members = [];
    _sessions = [];
    _attendance = [];
    persist();
  },
};

export const FINANCE_ADAPTER = "mock";
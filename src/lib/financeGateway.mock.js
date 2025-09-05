// src/lib/financeGateway.js
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
      sessions: [], // {id, turma_id, date, notes, duration_hours, headcount_snapshot, rate_snapshot}
      attendance: [], // {id, session_id, turma_id, student_id, present, note, snapshots...}
      expense_templates: [], // {id, title, category, amount, frequency, due_day, due_month, active, cost_center}
      expense_entries: [], // {id, template_id|null, title_snapshot, category, amount, competence_month, due_date, status, cost_center,...}
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
        expense_templates: [],
        expense_entries: [],
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
      expense_templates: d.expense_templates ?? [],
      expense_entries: d.expense_entries ?? [],
    };
  } catch {
    // fallback completo
    return {
      students: [],
      payers: [],
      payments: [],
      teachers: [],
      turmas: [],
      turma_members: [],
      sessions: [],
      attendance: [],
      expense_templates: [],
      expense_entries: [],
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
      expense_templates: state.expense_templates ?? [],
      expense_entries: state.expense_entries ?? [],
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
  expense_templates: _expense_templates,
  expense_entries: _expense_entries,
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
    expense_templates: _expense_templates,
    expense_entries: _expense_entries,
  });
}

function rateForSize(teacher, size) {
  if (!teacher || teacher.rate_mode !== "by_size")
    return Number(teacher?.hourly_rate || 0);
  const n = Math.max(0, Number(size || 0));
  const rules = Array.isArray(teacher.rate_rules) ? teacher.rate_rules : [];
  for (const r of rules) {
    const min = Number(r.min ?? 0);
    const max = Number(r.max ?? 1e9);
    const rate = Number(r.rate ?? 0);
    if (n >= min && n <= max) return rate;
  }
  return Number(teacher?.hourly_rate || 0);
}

const isoMonthStart = (ym) =>
  (ym.length === 7 ? ym + "-01" : ym).slice(0, 10);

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
  _payers.push({
    id,
    name: s.name,
    email: null,
    created_at: new Date().toISOString(),
  });
  s.payer_id = id;
  persist();
  return id;
}

function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate(); // último dia do mês
}

// ----------------- Students -----------------
async function listStudents() {
  return _students.slice();
}
async function createStudent({
  name,
  monthly_value,
  due_day,
  birth_date = null,
  status = "ativo",
  payer_id = null,
}) {
  if (!name || monthly_value == null || due_day == null)
    throw new Error("Obrigatórios: name, monthly_value, due_day");
  const b =
    birth_date && /^\d{4}-\d{2}-\d{2}$/.test(birth_date) ? birth_date : null;
  const st = {
    id: uid("stu_"),
    name: String(name),
    monthly_value: Number(monthly_value) || 0,
    due_day: Math.min(Math.max(Number(due_day) || 5, 1), 28),
    status,
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
  if (changes.monthly_value != null)
    s.monthly_value = Number(changes.monthly_value) || 0;
  if (changes.due_day != null)
    s.due_day = Math.min(Math.max(Number(changes.due_day) || 5, 1), 28);
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
  _payments = _payments.filter(
    (p) => !(p.student_id === id && p.status !== "paid")
  );
  _turma_members = _turma_members.filter((tm) => tm.student_id !== id);
  _students = _students.filter((x) => x.id !== id);
  persist();
  return true;
}

// ----------------- Payers -----------------
async function listPayers() {
  return _payers.slice();
}
async function createPayer({ name, email = null }) {
  if (!name) throw new Error("Nome é obrigatório");
  const py = {
    id: uid("pay_"),
    name: String(name),
    email: email || null,
    created_at: new Date().toISOString(),
  };
  _payers.push(py);
  persist();
  return py;
}

// ----------------- Teachers -----------------
async function listTeachers() {
  return _teachers.map((t) => ({
    ...t,
    hourly_rate: Number(t.hourly_rate ?? 0),
    pay_day: Math.min(Math.max(Number(t.pay_day ?? 5), 1), 28),
    rate_mode: t.rate_mode || "flat", // "flat" | "by_size"
    rate_rules: Array.isArray(t.rate_rules) ? t.rate_rules : [], // [{min,max,rate}]
  }));
}
async function createTeacher({
  name,
  email = null,
  phone = null,
  status = "ativo",
  hourly_rate = 0,
  pay_day = 5,
  rate_mode = "flat",
  rate_rules = [],
}) {
  if (!name) throw new Error("Nome é obrigatório");
  const t = {
    id: uid("tch_"),
    name: String(name),
    email: email || null,
    phone: phone || null,
    status,
    hourly_rate: Number(hourly_rate || 0),
    pay_day: Math.min(Math.max(Number(pay_day || 5), 1), 28),
    rate_mode: rate_mode === "by_size" ? "by_size" : "flat",
    rate_rules: Array.isArray(rate_rules) ? rate_rules : [],
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
  if (changes.status != null) t.status = changes.status;
  if (changes.hourly_rate !== undefined)
    t.hourly_rate = Number(changes.hourly_rate || 0);
  if (changes.pay_day !== undefined)
    t.pay_day = Math.min(Math.max(Number(changes.pay_day || 5), 1), 28);
  if (changes.rate_mode !== undefined)
    t.rate_mode = changes.rate_mode === "by_size" ? "by_size" : "flat";
  if (changes.rate_rules !== undefined)
    t.rate_rules = Array.isArray(changes.rate_rules)
      ? changes.rate_rules
      : [];
  persist();
  return t;
}
async function setTeacherStatus(id, status) {
  const t = _teachers.find((x) => x.id === id);
  if (!t) throw new Error("Professor não encontrado");
  t.status = status;
  persist();
  return t;
}
async function deleteTeacher(id) {
  _teachers = _teachers.filter((x) => x.id !== id);
  persist();
  return true;
}

// ----------------- Turmas -----------------
// Turma agora aceita agendamento padrão: meeting_day (0=dom..6=sáb), meeting_time "HH:MM"
// ----------------- Turmas -----------------
// ----------------- Turmas -----------------
// ----------------- Turmas -----------------
async function listTurmas() {
  // injeta defaults + migra legado (meeting_day/time/duration_default) para meeting_rules
  return _turmas.map((t) => {
    let rules = Array.isArray(t.meeting_rules) ? t.meeting_rules : null;

    // migrar campo antigo para 1 regra
    if (!rules) {
      const legacyHasAny =
        t.meeting_day === 0 || t.meeting_day || t.meeting_time || t.meeting_duration_default;
      if (legacyHasAny) {
        rules = [{
          weekday: (t.meeting_day === 0 || t.meeting_day) ? Number(t.meeting_day) : null, // 0..6 | null
          time: t.meeting_time || null,                      // "HH:MM"
          duration_hours: Number(t.meeting_duration_default ?? 0.5),
        }];
      }
    }

    // se ainda não houver, zera como lista
    if (!rules) rules = [];

    // normaliza cada item
    rules = rules.map(r => ({
      weekday: (r.weekday === 0 || r.weekday) ? Number(r.weekday) : null,
      time: r.time || null,
      duration_hours: Math.max(0, Number(r.duration_hours ?? 0.5)),
    }));

    return {
      ...t,
      meeting_rules: rules,
      // mantém legado para não quebrar telas antigas, mas não usar mais
      meeting_day: t.meeting_day ?? null,
      meeting_time: t.meeting_time ?? null,
      meeting_duration_default: Number(t.meeting_duration_default ?? 0.5),
    };
  });
}

async function createTurma({
  name,
  teacher_id = null,
  capacity = 20,
  meeting_rules = [], // [{weekday:0..6, time:"HH:MM", duration_hours:0.5}]
}) {
  if (!name) throw new Error("Nome da turma é obrigatório");

  const normRules = (Array.isArray(meeting_rules) ? meeting_rules : []).map(r => ({
    weekday: (r.weekday === 0 || r.weekday) ? Number(r.weekday) : null,
    time: r.time || null,
    duration_hours: Math.max(0, Number(r.duration_hours ?? 0.5)),
  }));

  const t = {
    id: uid("tur_"),
    name: String(name),
    teacher_id: teacher_id || null,
    capacity: Number(capacity || 20),
    meeting_rules: normRules,
    // campos legados ficam sempre nulos daqui pra frente
    meeting_day: null,
    meeting_time: null,
    meeting_duration_default: null,
    created_at: new Date().toISOString(),
  };
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

  // NOVO: substitui lista de regras inteira
  if (changes.meeting_rules !== undefined) {
    const normRules = (Array.isArray(changes.meeting_rules) ? changes.meeting_rules : []).map(r => ({
      weekday: (r.weekday === 0 || r.weekday) ? Number(r.weekday) : null,
      time: r.time || null,
      duration_hours: Math.max(0, Number(r.duration_hours ?? 0.5)),
    }));
    t.meeting_rules = normRules;
    // zera legado para não confundir
    t.meeting_day = null;
    t.meeting_time = null;
    t.meeting_duration_default = null;
  }

  // aceita ainda mudanças “legado”, mas já migra para rules
  const touchingLegacy = (
    changes.meeting_day !== undefined ||
    changes.meeting_time !== undefined ||
    changes.meeting_duration_default !== undefined
  );
  if (touchingLegacy) {
    const legacyRule = {
      weekday: (changes.meeting_day === 0 || changes.meeting_day) ? Number(changes.meeting_day) : null,
      time: changes.meeting_time || null,
      duration_hours: Math.max(0, Number(changes.meeting_duration_default ?? t.meeting_duration_default ?? 0.5)),
    };
    t.meeting_rules = [legacyRule];
    t.meeting_day = null;
    t.meeting_time = null;
    t.meeting_duration_default = null;
  }

  persist();
  return t;
}

async function deleteTurma(id) {
  const sessIds = _sessions.filter((s) => s.turma_id === id).map((s) => s.id);
  _attendance = _attendance.filter((a) => !sessIds.includes(a.session_id));
  _sessions = _sessions.filter((s) => s.turma_id !== id);
  _turma_members = _turma_members.filter((tm) => tm.turma_id !== id);
  _turmas = _turmas.filter((t) => t.id !== id);
  persist();
  return true;
}
async function listTurmaMembers(turma_id) {
  const ids = new Set(
    _turma_members
      .filter((tm) => tm.turma_id === turma_id)
      .map((tm) => tm.student_id)
  );
  return _students
    .filter((s) => ids.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, status: s.status }));
}
async function addStudentToTurma(turma_id, student_id) {
  const exists = _turma_members.some(
    (tm) => tm.turma_id === turma_id && tm.student_id === student_id
  );
  if (exists) return;
  _turma_members.push({ turma_id, student_id });
  persist();
}
async function removeStudentFromTurma(turma_id, student_id) {
  _turma_members = _turma_members.filter(
    (tm) => !(tm.turma_id === turma_id && tm.student_id === student_id)
  );
  persist();
}

// ----------------- Sessões -----------------
async function listSessions(turma_id) {
  return _sessions
    .filter((s) => s.turma_id === turma_id)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}
async function createSession({
  turma_id,
  date,
  notes = "",
  duration_hours = 0.5,
  headcount_snapshot = null,
}) {
  if (!turma_id) throw new Error("turma_id é obrigatório");
  if (!date) throw new Error("date é obrigatório (yyyy-mm-dd)");
  const s = {
    id: uid("ses_"),
    turma_id,
    date,
    notes: notes || "",
    duration_hours: Math.max(0, Number(duration_hours || 0.5)),
    headcount_snapshot:
      headcount_snapshot != null ? Number(headcount_snapshot) : null,
    rate_snapshot: null,
    created_at: new Date().toISOString(),
  };

  const turma = _turmas.find((t) => t.id === turma_id) || null;
  const teacher = turma ? _teachers.find((tt) => tt.id === turma.teacher_id) : null;
  const sizeNow =
    s.headcount_snapshot != null
      ? Number(s.headcount_snapshot)
      : _turma_members
          .filter((tm) => tm.turma_id === turma_id)
          .map((tm) => _students.find((st) => st.id === tm.student_id))
          .filter((st) => st && st.status === "ativo").length;

  s.rate_snapshot = rateForSize(teacher, sizeNow);

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

  let mustRecalcRate = false;
  if (changes.headcount_snapshot !== undefined) {
    s.headcount_snapshot =
      changes.headcount_snapshot != null
        ? Number(changes.headcount_snapshot)
        : null;
    mustRecalcRate = true;
  }
  if (mustRecalcRate) {
    const turma = _turmas.find((t) => t.id === s.turma_id) || null;
    const teacher = turma
      ? _teachers.find((tt) => tt.id === turma.teacher_id)
      : null;
    const sizeNow =
      s.headcount_snapshot != null
        ? Number(s.headcount_snapshot)
        : _turma_members
            .filter((tm) => tm.turma_id === s.turma_id)
            .map((tm) => _students.find((st) => st.id === tm.student_id))
            .filter((st) => st && st.status === "ativo").length;
    s.rate_snapshot = rateForSize(teacher, sizeNow);
  }

  persist();
  return s;
}
async function deleteSession(id) {
  _sessions = _sessions.filter((x) => x.id !== id);
  _attendance = _attendance.filter((a) => a.session_id !== id);
  persist();
  return true;
}

// ====== AUTOSESSÕES (a partir do agendamento de turma) ======
/**
 * Retorna as datas (prévia) em que haverá aula no mês (ym) para a turma,
 * respeitando meeting_day/meeting_time, e exclui as que já têm sessão criada.
 */
async function previewAutoSessions({ turma_id, ym, duration_hours = 0.5, notes = "" }) {
  const t = _turmas.find((x) => x.id === turma_id);
  if (!t) throw new Error("Turma não encontrada");
  if (t.meeting_day == null || !t.meeting_time)
    return []; // sem agenda configurada

  const monthStart = isoMonthStart(ym);
  const [Y, M] = monthStart.split("-").map(Number);
  const totalDays = daysInMonth(`${Y}-${String(M).padStart(2, "0")}`);

  const dayOfWeekWanted = Number(t.meeting_day);
  const exists = new Set(
    _sessions
      .filter((s) => s.turma_id === turma_id && (s.date || "").slice(0, 7) === `${Y}-${String(M).padStart(2,"0")}`)
      .map((s) => s.date)
  );

  const out = [];
  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(Date.UTC(Y, M - 1, d));
    const dow = date.getUTCDay(); // 0=domingo..6=sábado
    if (dow === dayOfWeekWanted) {
      const iso = `${Y}-${String(M).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!exists.has(iso)) {
        out.push({
          turma_id,
          date: iso,
          duration_hours: Number(duration_hours || 0.5),
          notes: notes || "",
        });
      }
    }
  }
  return out;
}

/** Gera efetivamente as sessões do mês conforme a prévia (não duplica as existentes) */
async function generateAutoSessions({ turma_id, ym, duration_hours = 0.5, notes = "" }) {
  const prev = await previewAutoSessions({ turma_id, ym, duration_hours, notes });
  const inserted = [];
  for (const s of prev) {
    const created = await createSession(s);
    inserted.push(created);
  }
  return inserted;
}

// ----------------- Payout de Professor -----------------
async function listTeacherSessionsByMonth(teacher_id, ym) {
  const ymKey = (ym || "").slice(0, 7);
  if (!teacher_id || ymKey.length !== 7) return [];
  const myTurmas = _turmas
    .filter((t) => t.teacher_id === teacher_id)
    .map((t) => t.id);
  if (myTurmas.length === 0) return [];
  const rows = _sessions.filter(
    (s) => myTurmas.includes(s.turma_id) && (s.date || "").slice(0, 7) === ymKey
  );
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
    return {
      hours: 0,
      sessions: 0,
      amount: 0,
      hourly_rate: 0,
      rate_mode: "flat",
      pay_day: 5,
    };

  const pay_day = Math.min(Math.max(Number(t.pay_day ?? 5), 1), 28);
  const sessions = await listTeacherSessionsByMonth(teacher_id, ym);

  let hours = 0;
  let amount = 0;
  for (const s of sessions) {
    const sess = _sessions.find((x) => x.id === s.id);
    const h = Number(sess?.duration_hours || 0);
    hours += h;
    const size = Number(sess?.headcount_snapshot ?? 0);
    const rate =
      sess && sess.rate_snapshot != null
        ? Number(sess.rate_snapshot)
        : rateForSize(t, size);
    amount += h * rate;
  }

  return {
    hours,
    sessions: sessions.length,
    amount,
    hourly_rate: Number(t.hourly_rate || 0),
    rate_mode: t.rate_mode || "flat",
    pay_day,
  };
}

// ----------------- Attendance -----------------
async function listAttendance(session_id) {
  return _attendance.filter((a) => a.session_id === session_id);
}
async function upsertAttendance(session_id, student_id, { present, note }) {
  const s = _sessions.find((x) => x.id === session_id);
  if (!s) throw new Error("Sessão não encontrada");
  const stu = _students.find((x) => x.id === student_id) || null;
  const turma = _turmas.find((x) => x.id === s.turma_id) || null;

  let row = _attendance.find(
    (a) => a.session_id === session_id && a.student_id === student_id
  );
  if (!row) {
    row = {
      id: uid("att_"),
      session_id,
      turma_id: s.turma_id,
      student_id,
      student_name_snapshot: stu?.name || "(Aluno removido)",
      turma_name_snapshot: turma?.name || "(Turma removida)",
      session_date_snapshot: s.date,
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
    .filter((a) => a.student_id === student_id)
    .sort((a, b) =>
      (b.session_date_snapshot || "").localeCompare(
        a.session_date_snapshot || ""
      )
    );
}

// ----------------- Financeiro (mensalidades) -----------------
async function previewGenerateMonth({ ym }) {
  const monthStart = isoMonthStart(ym);
  const due = calcDueDate(ym);
  return _students
    .filter((s) => s.status === "ativo" && (Number(s.monthly_value) || 0) > 0)
    .map((s) => {
      const payerId = ensurePayerForStudent(s);
      const exists = _payments.some(
        (p) => p.student_id === s.id && p.competence_month === monthStart
      );
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
      const already = _payments.some(
        (p) => p.student_id === s.id && p.competence_month === monthStart
      );
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
      const payer_name =
        py?.name ?? p.payer_name_snapshot ?? p.student_name_snapshot ?? student_name;
      const overdue =
        p.status === "pending" && p.due_date < today
          ? Math.max(
              0,
              Math.floor((new Date(today) - new Date(p.due_date)) / 86400000)
            )
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
      total_overdue: sum(
        rows.filter((r) => r.status === "pending" && r.days_overdue > 0)
      ),
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

// ----------------- DESPESAS (Gastos) -----------------

// ===== Templates (recorrentes) =====
async function listExpenseTemplates() {
  return _expense_templates
    .slice()
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
}

/**
 * frequency: "monthly" | "annual"
 * due_day: 1..28 (para monthly ou annual)
 * due_month: 1..12 (apenas para annual)
 * cost_center: "PJ" | "PF"
 */
async function createExpenseTemplate({
  title,
  category = null,
  amount,
  frequency = "monthly",
  due_day = 5,
  due_month = null,
  active = true,
  cost_center = "PJ",
}) {
  if (!title) throw new Error("Título é obrigatório");
  const row = {
    id: uid("ext_"),
    title: String(title),
    category: category || null,
    amount: Number(amount || 0),
    frequency, // "monthly" | "annual"
    due_day: Math.min(Math.max(Number(due_day || 5), 1), 28),
    due_month:
      frequency === "annual"
        ? Math.min(Math.max(Number(due_month || 1), 1), 12)
        : null,
    active: !!active,
    cost_center: cost_center === "PF" ? "PF" : "PJ",
    created_at: new Date().toISOString(),
  };
  _expense_templates.push(row);
  persist();
  return row;
}

async function updateExpenseTemplate(id, changes) {
  const e = _expense_templates.find((x) => x.id === id);
  if (!e) throw new Error("Despesa recorrente não encontrada");

  if (changes.title != null) e.title = String(changes.title);
  if (changes.category !== undefined) e.category = changes.category || null;
  if (changes.amount !== undefined) e.amount = Number(changes.amount || 0);
  if (changes.frequency) e.frequency = changes.frequency;
  if (changes.due_day !== undefined)
    e.due_day = Math.min(Math.max(Number(changes.due_day || 5), 1), 28);
  if (changes.due_month !== undefined)
    e.due_month = Math.min(Math.max(Number(changes.due_month || 1), 1), 12);
  if (changes.active !== undefined) e.active = !!changes.active;
  if (changes.cost_center !== undefined)
    e.cost_center = changes.cost_center === "PF" ? "PF" : "PJ";

  persist();
  return e;
}

async function deleteExpenseTemplate(id) {
  _expense_templates = _expense_templates.filter((x) => x.id !== id);
  persist();
  return true;
}

// ===== Lançamentos (mês) =====

/** Cria lançamento avulso (variável) já no mês da data informada */
async function createOneOffExpense({
  date,
  title,
  category = null,
  amount,
  cost_center = "PJ",
}) {
  if (!date) throw new Error("Data é obrigatória (yyyy-mm-dd)");
  const ym = String(date).slice(0, 7);
  const row = {
    id: uid("exn_"),
    template_id: null,
    title_snapshot: String(title || "Despesa"),
    category: category || null,
    cost_center: cost_center === "PF" ? "PF" : "PJ",
    competence_month: isoMonthStart(ym),
    due_date: date,
    amount: Number(amount || 0),
    status: "pending", // pending | paid | canceled
    paid_at: null,
    canceled_at: null,
    cancel_note: null,
    created_at: new Date().toISOString(),
  };
  _expense_entries.push(row);
  persist();
  return row;
}

/** Prévia do que seria gerado para o mês a partir dos templates ativos */
async function previewGenerateExpenses({ ym }) {
  const monthStart = isoMonthStart(ym);
  const due = calcDueDate(ym);
  const [, mm] = monthStart.split("-").map((n) => Number(n));

  return _expense_templates
    .filter((t) => t.active)
    .map((t) => {
      if (t.frequency === "annual" && t.due_month && t.due_month !== mm)
        return null;

      const already = _expense_entries.some(
        (e) => e.template_id === t.id && e.competence_month === monthStart
      );
      if (already) return null;

      const dueDate =
        t.frequency === "monthly"
          ? due(t.due_day)
          : `${monthStart.slice(0, 7)}-${String(
              Math.min(Math.max(Number(t.due_day || 5), 1), 28)
            ).padStart(2, "0")}`;

      return {
        template_id: t.id,
        title_snapshot: t.title,
        category: t.category,
        cost_center: t.cost_center === "PF" ? "PF" : "PJ",
        competence_month: monthStart,
        due_date: dueDate,
        amount: Number(t.amount || 0),
        status: "pending",
      };
    })
    .filter(Boolean);
}

/** Gera efetivamente os lançamentos do mês (a partir da prévia) */
async function generateExpenses({ ym }) {
  const monthStart = isoMonthStart(ym);
  const list = await previewGenerateExpenses({ ym });
  const inserted = [];

  for (const v of list) {
    const row = {
      id: uid("exn_"),
      ...v,
      paid_at: null,
      canceled_at: null,
      cancel_note: null,
      created_at: new Date().toISOString(),
    };
    _expense_entries.push(row);
    inserted.push(row);
  }
  persist();
  return inserted;
}

/** Lista lançamentos do mês + KPIs */
async function listExpenseEntries({ ym, status, cost_center }) {
  const monthStart = ym ? isoMonthStart(ym) : null;
  const today = new Date().toISOString().slice(0, 10);

  const rows = _expense_entries
    .filter((r) => (monthStart ? r.competence_month === monthStart : true))
    .filter((r) => (status && status !== "all" ? r.status === status : true))
    .filter((r) =>
      cost_center && (cost_center === "PJ" || cost_center === "PF")
        ? (r.cost_center || "PJ") === cost_center
        : true
    )
    .map((r) => ({
      ...r,
      days_overdue:
        r.status === "pending" && r.due_date < today
          ? Math.max(
              0,
              Math.floor((new Date(today) - new Date(r.due_date)) / 86400000)
            )
          : 0,
    }))
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));

  const sum = (arr) => arr.reduce((acc, it) => acc + Number(it.amount || 0), 0);
  return {
    rows,
    kpis: {
      total: sum(rows),
      paid: sum(rows.filter((r) => r.status === "paid")),
      pending: sum(rows.filter((r) => r.status === "pending")),
      overdue: sum(
        rows.filter((r) => r.status === "pending" && r.days_overdue > 0)
      ),
    },
  };
}

// ações nos lançamentos
async function markExpensePaid(id) {
  const r = _expense_entries.find((x) => x.id === id);
  if (!r) throw new Error("Lançamento não encontrado");
  r.status = "paid";
  r.paid_at = new Date().toISOString();
  r.canceled_at = null;
  r.cancel_note = null;
  persist();
}
async function reopenExpense(id) {
  const r = _expense_entries.find((x) => x.id === id);
  if (!r) throw new Error("Lançamento não encontrado");
  r.status = "pending";
  r.paid_at = null;
  r.canceled_at = null;
  r.cancel_note = null;
  persist();
}
async function cancelExpense(id, note) {
  const r = _expense_entries.find((x) => x.id === id);
  if (!r) throw new Error("Lançamento não encontrado");
  r.status = "canceled";
  r.canceled_at = new Date().toISOString();
  r.cancel_note = note || null;
  r.paid_at = null;
  persist();
}
async function deleteExpenseEntry(id) {
  _expense_entries = _expense_entries.filter((x) => x.id !== id);
  persist();
  return true;
}

// ----------------- Dashboard KPIs -----------------
/**
 * KPIs agregados para o dashboard do mês:
 * - mensalidades: billed/paid/pending/overdue
 * - despesas: total/paid/pending/overdue
 * - contagens básicas
 */
async function getDashboardKPIs({ ym }) {
  const pay = await listPayments({ ym, status: "all" });
  const exp = await listExpenseEntries({ ym, status: "all" });
  return {
    month: isoMonthStart(ym),
    payments: pay.kpis, // {total_billed, total_paid, total_pending, total_overdue}
    expenses: exp.kpis, // {total, paid, pending, overdue}
    counters: {
      students: _students.length,
      teachers: _teachers.length,
      turmas: _turmas.length,
    },
  };
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
  setTeacherStatus,
  deleteTeacher,
  listTeacherSessionsByMonth,
  sumTeacherPayoutByMonth,

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

  // autosessões (agenda)
  previewAutoSessions,
  generateAutoSessions,

  // attendance
  listAttendance,
  upsertAttendance,
  listAttendanceByStudent,

  // mensalidades (receitas)
  previewGenerateMonth,
  generateMonth,
  listPayments,
  markPaid,
  cancelPayment,
  reopenPayment,

  // DESPESAS – templates e lançamentos
  listExpenseTemplates,
  createExpenseTemplate,
  updateExpenseTemplate,
  deleteExpenseTemplate,
  previewGenerateExpenses,
  generateExpenses,
  listExpenseEntries,
  createOneOffExpense,
  markExpensePaid,
  reopenExpense,
  cancelExpense,
  deleteExpenseEntry,

  // dashboard
  getDashboardKPIs,

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
    _expense_templates = [];
    _expense_entries = [];
    persist();
  },
};

export const FINANCE_ADAPTER = "mock";

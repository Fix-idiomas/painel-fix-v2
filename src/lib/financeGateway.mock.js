const STORE_KEY = "__fix_finance_mock__";

function loadStore() {
  if (typeof window === "undefined")
    return { students: [], payers: [], payments: [], teachers: [] };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { students: [], payers: [], payments: [], teachers: [] };
    const d = JSON.parse(raw);
    return {
      students: Array.isArray(d.students) ? d.students : [],
      payers: Array.isArray(d.payers) ? d.payers : [],
      payments: Array.isArray(d.payments) ? d.payments : [],
      // teachers pode não existir em backups antigos → default []
      teachers: Array.isArray(d.teachers) ? d.teachers : [],
    };
  } catch {
    return { students: [], payers: [], payments: [], teachers: [] };
  }
}
function saveStore({ students, payers, payments, teachers }) {
  if (typeof window !== "undefined") {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        students: students ?? [],
        payers: payers ?? [],
        payments: payments ?? [],
        teachers: teachers ?? [],
      })
    );
  }
}

let {
  students: _students,
  payers: _payers,
  payments: _payments,
  teachers: _teachers,
} = loadStore();

const uid = (p = "id_") => p + Math.random().toString(36).slice(2, 10);
const isoMonthStart = (ym) => (ym.length === 7 ? ym + "-01" : ym).slice(0, 10);

function calcDueDate(ym) {
  const d = new Date(ym.length === 7 ? ym + "-01" : ym);
  const yyyy = d.getUTCFullYear();
  const mm = d.getUTCMonth() + 1;
  return (due_day) => {
    const day = Math.min(Math.max(Number(due_day || 5), 1), 28);
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
}

function ensurePayerForStudent(s) {
  if (s.payer_id) return s.payer_id;
  const id = uid("pay_");
  _payers.push({
    id,
    name: s.name,
    email: null,
    org_id: null,
    created_at: new Date().toISOString(),
  });
  s.payer_id = id;
  saveStore({
    students: _students,
    payers: _payers,
    payments: _payments,
    teachers: _teachers,
  });
  return id;
}

export const financeGateway = {
  // ---------- Students ----------
  async createStudent({ name, monthly_value, due_day, birth_date = null, status = "ativo", payer_id = null }) {
  if (!name || monthly_value == null || due_day == null)
    throw new Error("Obrigatórios: name, monthly_value, due_day");
  const b = birth_date && /^\d{4}-\d{2}-\d{2}$/.test(birth_date) ? birth_date : null;

  const st = {
    id: uid("stu_"),
    name,
    monthly_value: Number(monthly_value) || 0,
    due_day: Number(due_day) || 5,
    status, // "ativo" | "inativo"
    payer_id: payer_id || null, // ← se vier, já salva
    birth_date: b,
  };
  _students.push(st);
  saveStore({ students: _students, payers: _payers, payments: _payments, teachers: _teachers });
  return st;
},


  async listStudents() {
    return _students.slice();
  },

  async setStudentStatus(id, status) {
    const s = _students.find((x) => x.id === id);
    if (!s) throw new Error("Aluno não encontrado");
    s.status = status; // "ativo" | "inativo"
    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
    return s;
  },

  async updateStudent(id, changes) {
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
  if (changes.payer_id !== undefined) {
    s.payer_id = changes.payer_id || null;
  }
  // se existir pagador "próprio", mantém nome atualizado
  const py = _payers.find((p) => p.id === s.payer_id);
  if (py) py.name = s.name;

  saveStore({ students: _students, payers: _payers, payments: _payments, teachers: _teachers });
  return s;
},

  // Excluir aluno: remove aluno + pagamentos NÃO-PAGOS; mantém apenas pagos (com snapshots)
  async deleteStudent(id) {
    const sOld = _students.find((x) => x.id === id) || null;
    const payerNameOf = (p) => {
      const py = _payers.find((x) => x.id === p.payer_id);
      return (py && py.name) || (sOld && sOld.name) || "(Pagador removido)";
    };

    // snapshots nos pagos
    for (const p of _payments) {
      if (p.student_id !== id || p.status !== "paid") continue;
      if (!p.student_name_snapshot) p.student_name_snapshot = sOld?.name || "(Aluno removido)";
      if (!p.payer_name_snapshot) p.payer_name_snapshot = payerNameOf(p);
    }

    // limpa NÃO-PAGOS do aluno
    _payments = _payments.filter((p) => !(p.student_id === id && p.status !== "paid"));

    // remove aluno
    _students = _students.filter((x) => x.id !== id);

    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
    return true;
  },

  // ---------- Payers (Pagadores) ----------
  async listPayers() {
    return _payers.slice();
  },

  async createPayer({ name, email = null, org_id = null }) {
    if (!name) throw new Error("Nome é obrigatório");
    const py = {
      id: uid("pay_"),
      name: String(name),
      email: email || null,
      org_id: org_id ?? null,
      created_at: new Date().toISOString(),
    };
    _payers.push(py);
    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
    return py;
  },

  async updatePayer(id, changes) {
    const p = _payers.find((x) => x.id === id);
    if (!p) throw new Error("Pagador não encontrado");
    if (changes.name != null) p.name = String(changes.name);
    if (changes.email !== undefined) p.email = changes.email || null;
    if (changes.org_id !== undefined) p.org_id = changes.org_id ?? null;

    // atualiza exibição nos snapshots futuros (pagamentos existentes usam snapshot já salvo)
    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
    return p;
  },

  async deletePayer(id) {
    // não permitir deletar se estiver referenciado
    const refByStudent = _students.some((s) => s.payer_id === id);
    const refByPayment = _payments.some((p) => p.payer_id === id);
    if (refByStudent || refByPayment) {
      throw new Error("Não é possível excluir: pagador está em uso por alunos ou lançamentos.");
    }
    _payers = _payers.filter((x) => x.id !== id);
    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
    return true;
  },

  // ---------- Teachers (Professores) ----------
  async listTeachers() {
    return _teachers.slice();
  },

  async createTeacher({ name, email = null, phone = null, status = "ativo" }) {
    if (!name) throw new Error("Nome é obrigatório");
    const t = {
      id: uid("tch_"),
      name: String(name),
      email: email || null,
      phone: phone || null,
      status, // "ativo" | "inativo"
      created_at: new Date().toISOString(),
    };
    _teachers.push(t);
    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
    return t;
  },

  async updateTeacher(id, changes) {
    const t = _teachers.find((x) => x.id === id);
    if (!t) throw new Error("Professor não encontrado");
    if (changes.name != null) t.name = String(changes.name);
    if (changes.email !== undefined) t.email = changes.email || null;
    if (changes.phone !== undefined) t.phone = changes.phone || null;
    if (changes.status != null) t.status = changes.status; // "ativo" | "inativo"
    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
    return t;
  },

  async setTeacherStatus(id, status) {
    const t = _teachers.find((x) => x.id === id);
    if (!t) throw new Error("Professor não encontrado");
    t.status = status;
    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
    return t;
  },

  async deleteTeacher(id) {
    _teachers = _teachers.filter((x) => x.id !== id);
    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
    return true;
  },

  // ---------- Preview / Generate ----------
  async previewGenerateMonth({ ym }) {
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
  },

  async generateMonth({ ym }) {
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
    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
    return inserted;
  },

  // ---------- List / KPIs ----------
  async listPayments({ ym, status }) {
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
          status: p.status, // EN
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
  },

  // ---------- Payment Actions ----------
  async markPaid(id) {
    const p = _payments.find((x) => x.id === id);
    if (!p) throw new Error("Pagamento não encontrado");
    p.status = "paid";
    p.paid_at = new Date().toISOString();
    p.canceled_at = null;
    p.cancel_note = null;
    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
  },

  async cancelPayment(id, note) {
    const p = _payments.find((x) => x.id === id);
    if (!p) throw new Error("Pagamento não encontrado");
    p.status = "canceled";
    p.canceled_at = new Date().toISOString();
    p.cancel_note = note || null;
    p.paid_at = null;
    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
  },

  async reopenPayment(id) {
    const p = _payments.find((x) => x.id === id);
    if (!p) throw new Error("Pagamento não encontrado");
    p.status = "pending";
    p.paid_at = null;
    p.canceled_at = null;
    p.cancel_note = null;
    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
  },

  async isAdmin() {
    return true;
  },
  async __reset() {
    _students = [];
    _payers = [];
    _payments = [];
    _teachers = [];
    saveStore({
      students: _students,
      payers: _payers,
      payments: _payments,
      teachers: _teachers,
    });
  },
};

// Exporta um identificador do adapter atual (mock)
export const FINANCE_ADAPTER = "mock";

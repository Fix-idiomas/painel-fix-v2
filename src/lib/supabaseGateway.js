import { supabase } from "./supabaseClient";

// ------------------------ Helpers ------------------------
const mapErr = (ctx, err) => {
  console.error(`[supabaseGateway] ${ctx}:`, err?.message || err);
  throw new Error(err?.message || `Erro em ${ctx}`);
};

// Normaliza meeting_rules para manter shape consistente
function normalizeRules(rules) {
  const arr = Array.isArray(rules) ? rules : [];
  return arr.map((r) => ({
    weekday: (r?.weekday === 0 || r?.weekday) ? Number(r.weekday) : null, // 0..6 | null
    time: r?.time || null,                                                // "HH:MM" | null
    duration_hours: Number(r?.duration_hours ?? 0.5),
  }));
}

// Datas úteis locais (evita depender de helpers externos)
const monthStartOf = (ym /* "YYYY-MM" ou "YYYY-MM-DD" */) => {
  if (!ym || typeof ym !== "string" || ym.length < 7) {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  const base = ym.length === 7 ? `${ym}-01` : ym.slice(0, 10);
  const [Y, M] = base.slice(0, 7).split("-");
  return `${Y}-${M}-01`;
};

const clampDay1to28 = (n) => Math.min(Math.max(Number(n || 5), 1), 28);

const dueDateFor = (ym /* "YYYY-MM" */, due_day /* 1..28 */) => {
  const base = monthStartOf(ym); // "YYYY-MM-01"
  const [Y, M] = base.split("-").map(Number);
  const d = clampDay1to28(due_day);
  return `${Y}-${String(M).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

// Retorna "YYYY-MM-DD" no fuso America/Sao_Paulo
function tzToday(tz = "America/Sao_Paulo") {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const Y = parts.find((p) => p.type === "year")?.value;
  const M = parts.find((p) => p.type === "month")?.value;
  const D = parts.find((p) => p.type === "day")?.value;
  return `${Y}-${M}-${D}`;
}

// +N dias em "YYYY-MM-DD"
function addDaysISO(ymd /* "YYYY-MM-DD" */, n = 0) {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  const Y = d.getUTCFullYear();
  const M = String(d.getUTCMonth() + 1).padStart(2, "0");
  const D = String(d.getUTCDate()).padStart(2, "0");
  return `${Y}-${M}-${D}`;
}

/**
 * Converte "YYYY-MM-DD" (ou com hora "YYYY-MM-DDTHH:mm[:ss][Z]") para ISO (timestamptz).
 * Útil porque `sessions.date` é `timestamptz` no banco.
 */
function toIsoTz(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();

  // Já veio com hora → deixa o Date resolver
  if (s.length > 10) {
    const dFull = new Date(s);
    if (isNaN(dFull)) return null;
    return dFull.toISOString();
  }

  // Só data → cria em horário local 00:00 e converte para ISO
  const [Y, M, D] = s.split("-").map(Number);
  const d = new Date(Y, (M || 1) - 1, D || 1, 0, 0, 0);
  if (isNaN(d)) return null;
  return d.toISOString();
}

// ========================================================

export const supabaseGateway = {
  // ==============================
  // ALUNOS (CRUD + evolução)
  // ==============================
  async listStudents() {
    const { data, error } = await supabase
      .from("students")
      .select("id,name,status,monthly_value,due_day,birth_date,payer_id")
      .order("name", { ascending: true });
    if (error) mapErr("listStudents", error);
    return data || [];
  },

  async createStudent({
    name,
    monthly_value,
    due_day,
    birth_date = null,
    status = "ativo",
    payer_id = null,
  }) {
    if (!name) throw new Error("Nome é obrigatório");
    const row = {
      name: String(name).trim(),
      monthly_value: Number(monthly_value || 0),
      due_day: clampDay1to28(due_day),
      birth_date: birth_date || null,
      status: status || "ativo",
      payer_id: payer_id || null,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("students")
      .insert(row)
      .select("id,name,status,monthly_value,due_day,birth_date,payer_id")
      .single();
    if (error) mapErr("createStudent", error);
    return data;
  },

  async updateStudent(id, changes) {
    if (!id) throw new Error("ID é obrigatório");
    const patch = {};
    if (changes?.name != null)            patch.name = String(changes.name).trim();
    if (changes?.monthly_value != null)   patch.monthly_value = Number(changes.monthly_value || 0);
    if (changes?.due_day != null)         patch.due_day = clampDay1to28(changes.due_day);
    if (changes?.birth_date !== undefined)patch.birth_date = changes.birth_date || null;
    if (changes?.payer_id !== undefined)  patch.payer_id = changes.payer_id || null;

    const { data, error } = await supabase
      .from("students")
      .update(patch)
      .eq("id", id)
      .select("id,name,status,monthly_value,due_day,birth_date,payer_id")
      .single();
    if (error) mapErr("updateStudent", error);
    return data;
  },

  async setStudentStatus(id, status) {
    if (!id) throw new Error("ID é obrigatório");
    const { data, error } = await supabase
      .from("students")
      .update({ status })
      .eq("id", id)
      .select("id,name,status")
      .single();
    if (error) mapErr("setStudentStatus", error);
    return data;
  },

  async deleteStudent(id) {
    if (!id) throw new Error("ID é obrigatório");
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) mapErr("deleteStudent", error);
    return true;
  },

  // Evolução do aluno (lista presenças com join de sessão e nome da turma)
  async listAttendanceByStudent(studentId) {
    if (!studentId) return [];
    const { data, error } = await supabase
      .from("attendance")
      .select("session_id,present,note,sessions!inner(id,date,turma_id,turmas(name))")
      .eq("student_id", studentId);
    if (error) mapErr("listAttendanceByStudent", error);

    const rows = (data || []).map((r) => ({
      key: `${r.session_id}:${studentId}`,
      session_id: r.session_id,
      present: !!r.present,
      note: r.note || "",
      turma_id: r.sessions?.turma_id || null,
      session_date_snapshot: r.sessions?.date || null,
      turma_name_snapshot: r.sessions?.turmas?.name || null,
    }));

    rows.sort((a, b) =>
      String(b.session_date_snapshot || "").localeCompare(
        String(a.session_date_snapshot || "")
      )
    );
    return rows;
  },

  // ==============================
  // PROFESSORES (CRUD + list)
  // ==============================
  async listTeachers() {
    const { data, error } = await supabase
      .from("teachers")
      .select("id,name,user_id,status,hourly_rate,pay_day,rate_mode,rate_rules")
      .order("name", { ascending: true });
    if (error) mapErr("listTeachers", error);
    return data || [];
  },

  async createTeacher({
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
    const row = {
      name: String(name).trim(),
      email: email || null,
      phone: phone || null,
      status: status || "ativo",
      hourly_rate: Number(hourly_rate || 0),
      pay_day: clampDay1to28(pay_day),
      rate_mode: rate_mode === "by_size" ? "by_size" : "flat",
      rate_rules: Array.isArray(rate_rules) ? rate_rules : [],
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("teachers")
      .insert(row)
      .select("id,name,email,phone,status,hourly_rate,pay_day,rate_mode,rate_rules")
      .single();
    if (error) mapErr("createTeacher", error);
    return data;
  },

  async updateTeacher(id, changes) {
    if (!id) throw new Error("ID do professor é obrigatório.");
    const patch = {};
    if (changes?.name != null)              patch.name = String(changes.name).trim();
    if (changes?.email !== undefined)       patch.email = changes.email || null;
    if (changes?.phone !== undefined)       patch.phone = changes.phone || null;
    if (changes?.status != null)            patch.status = changes.status;
    if (changes?.hourly_rate !== undefined) patch.hourly_rate = Number(changes.hourly_rate || 0);
    if (changes?.pay_day !== undefined)     patch.pay_day = clampDay1to28(changes.pay_day);
    if (changes?.rate_mode !== undefined)   patch.rate_mode = changes.rate_mode === "by_size" ? "by_size" : "flat";
    if (changes?.rate_rules !== undefined)  patch.rate_rules = Array.isArray(changes.rate_rules) ? changes.rate_rules : [];

    const { data, error } = await supabase
      .from("teachers")
      .update(patch)
      .eq("id", id)
      .select("id,name,email,phone,status,hourly_rate,pay_day,rate_mode,rate_rules")
      .single();
    if (error) mapErr("updateTeacher", error);
    return data;
  },

  async setTeacherStatus(id, status) {
    if (!id) throw new Error("ID do professor é obrigatório.");
    const { data, error } = await supabase
      .from("teachers")
      .update({ status })
      .eq("id", id)
      .select("id,name,status")
      .single();
    if (error) mapErr("setTeacherStatus", error);
    return data;
  },

  async deleteTeacher(id) {
    if (!id) throw new Error("ID do professor é obrigatório.");
    const { error } = await supabase.from("teachers").delete().eq("id", id);
    if (error) mapErr("deleteTeacher", error);
    return true;
  },

  // ==============================
  // PAYERS (CRUD)
  // ==============================
  async listPayers() {
    const { data, error } = await supabase
      .from("payers")
      .select("id,name,email,created_at,updated_at")
      .order("name", { ascending: true });
    if (error) mapErr("listPayers", error);
    return data || [];
  },

  async createPayer({ name, email = null }) {
    if (!name) throw new Error("Nome é obrigatório");
    const row = { name: String(name).trim(), email: email || null };
    const { data, error } = await supabase
      .from("payers")
      .insert(row)
      .select("id,name,email,created_at,updated_at")
      .single();
    if (error) mapErr("createPayer", error);
    return data;
  },

  async updatePayer(id, changes) {
    if (!id) throw new Error("ID é obrigatório");
    const patch = {};
    if (changes?.name != null)  patch.name  = String(changes.name).trim();
    if (changes?.email !== undefined) patch.email = changes.email || null;

    const { data, error } = await supabase
      .from("payers")
      .update(patch)
      .eq("id", id)
      .select("id,name,email,created_at,updated_at")
      .single();
    if (error) mapErr("updatePayer", error);
    return data;
  },

  async deletePayer(id) {
    if (!id) throw new Error("ID é obrigatório");
    const { error } = await supabase.from("payers").delete().eq("id", id);
    if (error) mapErr("deletePayer", error);
    return true;
  },

  // ==============================
  // TURMAS & MEMBROS
  // ==============================
  async listTurmas() {
    const { data, error } = await supabase
      .from("turmas")
      .select("id,name,teacher_id,capacity,meeting_rules")
      .order("name", { ascending: true });
    if (error) mapErr("listTurmas", error);
    return (data || []).map((t) => ({
      ...t,
      meeting_rules: normalizeRules(t.meeting_rules),
    }));
  },

  async countStudentsInTurma(turmaId) {
    const { count, error } = await supabase
      .from("turma_members")
      .select("*", { count: "exact", head: true })
      .eq("turma_id", turmaId);
    if (error) mapErr("countStudentsInTurma", error);
    return count || 0;
  },

  async listTurmaMembers(turmaId) {
    const { data: links, error: e1 } = await supabase
      .from("turma_members")
      .select("student_id")
      .eq("turma_id", turmaId);
    if (e1) mapErr("listTurmaMembers.links", e1);

    const ids = (links || []).map((r) => r.student_id);
    if (ids.length === 0) return [];

    const { data: students, error: e2 } = await supabase
      .from("students")
      .select("id,name,status")
      .in("id", ids);
    if (e2) mapErr("listTurmaMembers.students", e2);

    return (students || []).sort((a, b) => a.name.localeCompare(b.name));
  },

  async createTurma(payload) {
    const row = {
      name: String(payload?.name || "").trim(),
      teacher_id: payload?.teacher_id || null,
      capacity: Number(payload?.capacity ?? 20),
      meeting_rules: normalizeRules(payload?.meeting_rules),
    };
    if (!row.name) throw new Error("Nome da turma é obrigatório.");

    const { data, error } = await supabase
      .from("turmas")
      .insert(row)
      .select("id,name,teacher_id,capacity,meeting_rules")
      .single();
    if (error) mapErr("createTurma", error);

return { ...data, meeting_rules: normalizeRules(data.meeting_rules) };
},

  async updateTurma(id, changes) {
    if (!id) throw new Error("ID da turma é obrigatório.");

    const patch = {};
    if (changes?.name != null)             patch.name = String(changes.name).trim();
    if (changes?.teacher_id !== undefined) patch.teacher_id = changes.teacher_id || null;
    if (changes?.capacity != null)         patch.capacity = Number(changes.capacity ?? 20);
    if (changes?.meeting_rules !== undefined)
      patch.meeting_rules = normalizeRules(changes.meeting_rules);

    const { data, error } = await supabase
      .from("turmas")
      .update(patch)
      .eq("id", id)
      .select("id,name,teacher_id,capacity,meeting_rules")
      .single();
    if (error) mapErr("updateTurma", error);

  return { ...data, meeting_rules: normalizeRules(data.meeting_rules) };
},

  async deleteTurma(id) {
    if (!id) throw new Error("ID da turma é obrigatório.");
    const { error } = await supabase.from("turmas").delete().eq("id", id);
    if (error) mapErr("deleteTurma", error);
    return true;
  },

  async addStudentToTurma(turmaId, studentId) {
    if (!turmaId || !studentId) throw new Error("turmaId e studentId são obrigatórios.");
    const { error } = await supabase
      .from("turma_members")
      .insert({ turma_id: turmaId, student_id: studentId, status: "ativo" });
    if (error && error.code !== "23505") mapErr("addStudentToTurma", error);
    return true;
  },

  async removeStudentFromTurma(turmaId, studentId) {
    if (!turmaId || !studentId) throw new Error("turmaId e studentId são obrigatórios.");
    const { error } = await supabase
      .from("turma_members")
      .delete()
      .eq("turma_id", turmaId)
      .eq("student_id", studentId);
    if (error) mapErr("removeStudentFromTurma", error);
    return true;
  },

  // ==============================
  // SESSÕES & PRESENÇAS
  // ==============================
  async listSessions(turmaId) {
  const { data, error } = await supabase
    .from("sessions")
    .select("id,turma_id,date,duration_hours,notes,headcount_snapshot")
    .eq("turma_id", turmaId)
    .order("date", { ascending: true });
  if (error) mapErr("listSessions", error);

  // 🔧 normaliza: guarda apenas o dia para o front
  return (data || []).map(r => ({
    ...r,
    date: String(r.date).slice(0, 10), // "YYYY-MM-DD"
  }));
},
// Lista sessões de uma turma num intervalo [start, end] e indica se têm presença
  async listSessionsWithAttendance({ turmaId, start, end }) {
    if (!turmaId) throw new Error("listSessionsWithAttendance: 'turmaId' é obrigatório");

    const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID || "11111111-1111-4111-8111-111111111111";
    const s = String(start || "").slice(0, 10); // "YYYY-MM-DD"
    const e = String(end   || "").slice(0, 10); // "YYYY-MM-DD"
    if (!s || !e) throw new Error("listSessionsWithAttendance: 'start' e 'end' são obrigatórios (YYYY-MM-DD)");

    // janela do dia inteiro (UTC)
    const startISO = `${s}T00:00:00Z`;
    const endISO   = `${e}T23:59:59Z`;

    // 1) sessões do período (tenant + turma)
    const { data: sessRows, error: eS } = await supabase
      .from("sessions")
      .select("id, turma_id, date, duration_hours, notes")
      .eq("tenant_id", TENANT_ID)
      .eq("turma_id", turmaId)
      .gte("date", startISO)
      .lte("date", endISO)
      .order("date", { ascending: true });
    if (eS) throw new Error(eS.message);
    if (!sessRows || sessRows.length === 0) return [];

    // 2) presenças (só para flag visual)
    const ids = sessRows.map(x => x.id);
    const { data: att, error: eA } = await supabase
      .from("attendance")
      .select("session_id")
      .eq("tenant_id", TENANT_ID)
      .in("session_id", ids);
    if (eA) throw new Error(eA.message);

    const has = new Set((att || []).map(a => a.session_id));

    // normaliza data p/ ISO (evita "Invalid Date" no front)
    const toIso = (d) => (d ? new Date(d).toISOString() : null);

    return sessRows.map(row => ({
      id: row.id,
      turma_id: row.turma_id,
      date: toIso(row.date),                   // sempre ISO válido
      duration_hours: Number(row.duration_hours || 0),
      notes: row.notes || "",
      has_attendance: has.has(row.id),         // só indicador visual
    }));
  },

  async createSession(payload) {
    // payload: { turma_id, date ("YYYY-MM-DD" ou ISO), notes?, duration_hours?, headcount_snapshot? }
    const row = {
      turma_id: payload?.turma_id,
      date: toIsoTz(String(payload?.date || "").slice(0, 25)),
      notes: payload?.notes || "",
      duration_hours: Number(payload?.duration_hours ?? 0.5),
      headcount_snapshot:
        payload?.headcount_snapshot != null ? Number(payload.headcount_snapshot) : null,
    };
    if (!row.turma_id) throw new Error("turma_id é obrigatório.");
    if (!row.date) throw new Error("date é obrigatório (YYYY-MM-DD ou ISO).");

    const { data, error } = await supabase
      .from("sessions")
      .insert(row)
      .select("id,turma_id,date,duration_hours,notes,headcount_snapshot")
      .single();
    if (error) mapErr("createSession", error);
    return data;
  },

  async updateSession(id, changes) {
    if (!id) throw new Error("ID da sessão é obrigatório.");

    const patch = {};
    if (changes?.date != null) {
      patch.date = toIsoTz(String(changes.date).slice(0, 25));
    }
    if (changes?.notes != null)            patch.notes = changes.notes || "";
    if (changes?.duration_hours !== undefined)
      patch.duration_hours = Number(changes.duration_hours ?? 0.5);
    if (changes?.headcount_snapshot !== undefined)
      patch.headcount_snapshot =
        changes.headcount_snapshot != null ? Number(changes.headcount_snapshot) : null;

    const { data, error } = await supabase
      .from("sessions")
      .update(patch)
      .eq("id", id)
      .select("id,turma_id,date,duration_hours,notes,headcount_snapshot")
      .single();
    if (error) mapErr("updateSession", error);
    return data;
  },

  // Sessão avulsa (ex: reposição, aula extra)
  async createOneOffSession({
    turma_id,
    date, // "YYYY-MM-DD" ou ISO
    notes = "Aula avulsa",
    duration_hours = 1,
    headcount_snapshot = null,
  }) {
    if (!turma_id) throw new Error("createOneOffSession: 'turma_id' é obrigatório.");
    if (!date) throw new Error("createOneOffSession: 'date' é obrigatório (YYYY-MM-DD ou ISO).");

    const row = {
      turma_id,
      date: toIsoTz(String(date).slice(0, 25)),
      notes,
      duration_hours: Number(duration_hours),
      headcount_snapshot:
        headcount_snapshot != null ? Number(headcount_snapshot) : null,
    };

    const { data, error } = await supabase
      .from("sessions")
      .insert([row])
      .select("id,turma_id,date,duration_hours,notes,headcount_snapshot")
      .single();

    if (error) throw new Error(`createOneOffSession: ${error.message}`);
    return data;
  },

  async deleteSession(id) {
    if (!id) throw new Error("ID da sessão é obrigatório.");
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) mapErr("deleteSession", error);
    return true;
  },

  async listAttendance(sessionId) {
    const { data, error } = await supabase
      .from("attendance")
      .select("student_id,present,note")
      .eq("session_id", sessionId);
    if (error) mapErr("listAttendance", error);
    return data || [];
  },

  async upsertAttendance(sessionId, studentId, { present, note }) {
    if (!sessionId || !studentId) throw new Error("sessionId e studentId são obrigatórios.");
    const { error } = await supabase
      .from("attendance")
      .upsert(
        [{ session_id: sessionId, student_id: studentId, present: !!present, note: note || "" }],
        { onConflict: "session_id,student_id", ignoreDuplicates: false }
      );
    if (error) mapErr("upsertAttendance", error);
    return true;
  },

  /**
   * IDEMPOTENTE: Gera sessões a partir de meeting_rules no intervalo [startDate, endDate].
   * Usa UPSERT com onConflict (turma_id,date) — requer índice único criado no banco.
   */
  async ensureSessionsFromRules({ turmaId, startDate, endDate }) {
    if (!turmaId) throw new Error("ensureSessionsFromRules: 'turmaId' é obrigatório");
    const start = new Date(String(startDate).slice(0, 10));
    const end   = new Date(String(endDate).slice(0, 10));
    if (isNaN(start) || isNaN(end) || end < start) {
      throw new Error("ensureSessionsFromRules: intervalo inválido");
    }

    // 1) regras da turma
    const { data: turma, error: eT } = await supabase
      .from("turmas")
      .select("id, meeting_rules")
      .eq("id", turmaId)
      .single();
    if (eT) mapErr("ensureSessionsFromRules.turma", eT);

    const rules = normalizeRules(turma?.meeting_rules);
    const ruleByWeekday = new Map();
    for (const r of rules) {
      if (r.weekday === null || r.weekday === undefined) continue;
      if (!ruleByWeekday.has(r.weekday)) ruleByWeekday.set(r.weekday, r);
    }
    if (ruleByWeekday.size === 0) return 0;

    // 2) gera linhas para cada dia cujo weekday bate (formato ISO/timestamptz)
    const rows = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const wd = d.getUTCDay(); // 0..6
      const r  = ruleByWeekday.get(wd);
      if (!r) continue;

      const yyyy = d.getUTCFullYear();
      const mm   = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd   = String(d.getUTCDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;

      rows.push({
        turma_id: turmaId,
        date: toIsoTz(dateStr), // timestamptz consistente
        duration_hours: Number(r.duration_hours ?? 0.5),
        notes: null,
        headcount_snapshot: null,
      });
    }
    if (rows.length === 0) return 0;

    // 3) upsert idempotente
    const { error: eU } = await supabase
      .from("sessions")
      .upsert(rows, { onConflict: "turma_id,date", ignoreDuplicates: false });
    if (eU) mapErr("ensureSessionsFromRules.upsert", eU);

    return rows.length;
  },

  /**
   * PRUNE: Remove sessões FUTURAS no intervalo [startDate, endDate] que:
   * - não batem com as meeting_rules atuais da turma E
   * - não possuem presença lançada (qualquer registro em attendance).
   * Nunca mexe em sessões com presença.
   */
  async pruneSessionsNotInRules({ turmaId, startDate, endDate }) {
    if (!turmaId) throw new Error("pruneSessionsNotInRules: 'turmaId' é obrigatório");
    const s = String(startDate).slice(0, 10);
    const e = String(endDate).slice(0, 10);

    // 1) regras atuais (weekdays válidos)
    const { data: turma, error: eT } = await supabase
      .from("turmas")
      .select("id, meeting_rules")
      .eq("id", turmaId)
      .single();
    if (eT) mapErr("pruneSessionsNotInRules.turma", eT);
    const rules = normalizeRules(turma?.meeting_rules);
    const validWeekdays = new Set(rules.filter(r => r.weekday !== null).map(r => r.weekday));

    // 2) sessões do intervalo
    const { data: sessions, error: eS } = await supabase
      .from("sessions")
      .select("id, turma_id, date")
      .eq("turma_id", turmaId)
      .gte("date", s)
      .lte("date", e);
    if (eS) mapErr("pruneSessionsNotInRules.sessions", eS);
    if (!sessions || sessions.length === 0) return 0;

    // 3) presença por sessão
    const ids = sessions.map((x) => x.id);
    const { data: att, error: eA } = await supabase
      .from("attendance")
      .select("session_id")
      .in("session_id", ids);
    if (eA) mapErr("pruneSessionsNotInRules.attendance", eA);
    const protectedIds = new Set((att || []).map((a) => a.session_id));

    // 4) marca para exclusão se weekday NÃO está nas regras E não tem presença
    const toDelete = [];
    for (const sRow of sessions) {
      const d = new Date(sRow.date);
      if (isNaN(d)) continue;
      const wd = d.getUTCDay();
      if (!validWeekdays.has(wd) && !protectedIds.has(sRow.id)) {
        toDelete.push(sRow.id);
      }
    }
    if (toDelete.length === 0) return 0;

    const { error: eD } = await supabase
      .from("sessions")
      .delete()
      .in("id", toDelete);
    if (eD) mapErr("pruneSessionsNotInRules.delete", eD);

    return toDelete.length;
  },

  /**
   * Gera/atualiza sessões FUTURAS (idempotente) e poda as fora das regras.
   */
  async generateSessionsForTurma(turma, { horizonDays = 90 } = {}) {
    const turmaId = typeof turma === "string" ? turma : turma?.id;
    if (!turmaId) throw new Error("generateSessionsForTurma: turmaId inválido");

    const start = tzToday("America/Sao_Paulo");     // "YYYY-MM-DD"
    const end   = addDaysISO(start, horizonDays);   // "YYYY-MM-DD"

    const ensure = this.ensureSessionsFromRules || this.ensureSessionsfromRules;
    if (!ensure) {
      console.warn("[turmas] ensureSessionsFromRules não encontrado — pulando geração.");
      return { generated: 0, pruned: 0, start, end };
    }

    const generated = await ensure.call(this, { turmaId, startDate: start, endDate: end });

    const prune = this.pruneSessionsNotInRules || this.pruneSessionsOutsideRules;
    let pruned = 0;
    if (prune) {
      try {
        pruned = await prune.call(this, { turmaId, startDate: start, endDate: end });
      } catch (e) {
        console.warn("[turmas] pruneSessions* falhou:", e?.message || e);
      }
    }

    return { generated, pruned, start, end };
  },

  // ==============================
  // FINANCEIRO — Mensalidades
  // ==============================
  async previewGenerateMonth({ ym }) {
    const monthStart = monthStartOf(ym);
    const { data: students, error: e1 } = await supabase
      .from("students")
      .select("id,name,monthly_value,due_day,payer_id,status")
      .eq("status", "ativo");
    if (e1) mapErr("previewGenerateMonth.students", e1);

    const actives = (students || []).filter((s) => Number(s.monthly_value || 0) > 0);
    if (actives.length === 0) return [];

    const { data: existing, error: e2 } = await supabase
      .from("payments")
      .select("student_id,competence_month,status")
      .eq("competence_month", monthStart)
      .neq("status", "canceled");
    if (e2) mapErr("previewGenerateMonth.existing", e2);

    const setExisting = new Set((existing || []).map((p) => p.student_id));

    const out = [];
    for (const s of actives) {
      if (setExisting.has(s.id)) continue;

      const due_date = dueDateFor(monthStart.slice(0, 7), s.due_day);
      out.push({
        student_id: s.id,
        _student_name_snapshot: s.name,
        payer_id: s.payer_id || null,
        _needs_payer: !s.payer_id,
        competence_month: monthStart,
        due_date,
        amount: Number(s.monthly_value || 0),
        status: "pending",
      });
    }
    return out;
  },

  async generateMonth({ ym }) {
    const monthStart = monthStartOf(ym);

    const { data: students, error: e1 } = await supabase
      .from("students")
      .select("id,name,monthly_value,due_day,payer_id,status")
      .eq("status", "ativo");
    if (e1) mapErr("generateMonth.students", e1);

    const { data: existing, error: e2 } = await supabase
      .from("payments")
      .select("student_id")
      .eq("competence_month", monthStart)
      .neq("status", "canceled");
    if (e2) mapErr("generateMonth.existing", e2);

    const exists = new Set((existing || []).map((p) => p.student_id));

    const { data: payers, error: e3 } = await supabase
      .from("payers")
      .select("id,name");
    if (e3) mapErr("generateMonth.payers", e3);
    const payerName = new Map((payers || []).map((p) => [p.id, p.name]));

    const toInsert = [];
    for (const s of students || []) {
      const amount = Number(s.monthly_value || 0);
      if (amount <= 0) continue;
      if (exists.has(s.id)) continue;

      let payer_id = s.payer_id || null;

      if (!payer_id) {
        const { data: createdPayer, error: ep } = await supabase
          .from("payers")
          .insert({ name: s.name })
          .select("id,name")
          .single();
        if (ep) mapErr("generateMonth.createPayer", ep);
        payer_id = createdPayer.id;
        payerName.set(createdPayer.id, createdPayer.name);

        const { error: es } = await supabase
          .from("students")
          .update({ payer_id })
          .eq("id", s.id);
        if (es) mapErr("generateMonth.linkPayerToStudent", es);
      }

      const due_date = dueDateFor(monthStart.slice(0, 7), s.due_day);
      const pyName = payerName.get(payer_id) || s.name;

      toInsert.push({
        student_id: s.id,
        payer_id,
        competence_month: monthStart,
        due_date,
        amount,
        status: "pending",
        paid_at: null,
        canceled_at: null,
        cancel_note: null,
        created_at: new Date().toISOString(),
        student_name_snapshot: s.name,
        payer_name_snapshot: pyName,
      });
    }

    if (toInsert.length === 0) return [];

    const { data, error } = await supabase
      .from("payments")
      .upsert(toInsert, { onConflict: "student_id,competence_month", ignoreDuplicates: true })
      .select("*");
    if (error) mapErr("generateMonth.upsertPayments", error);

    return data || [];
  },

  async listPayments({ ym, status }) {
    const monthStart = ym ? monthStartOf(ym) : null;

    let q = supabase
      .from("payments")
      .select(
        "id,student_id,payer_id,competence_month,due_date,amount,status,paid_at,canceled_at,cancel_note,created_at,student_name_snapshot,payer_name_snapshot"
      );

    if (monthStart) q = q.eq("competence_month", monthStart);
    if (status && status !== "all") q = q.eq("status", status);

    const { data, error } = await q;
    if (error) mapErr("listPayments", error);

    const today = tzToday("America/Sao_Paulo");
    const rows = (data || []).map((p) => ({
      ...p,
      days_overdue:
        p.status === "pending" && p.due_date < today
          ? Math.max(0, Math.floor((new Date(today) - new Date(p.due_date)) / 86400000))
          : 0,
    }));

    const sum = (arr) => arr.reduce((acc, it) => acc + Number(it.amount || 0), 0);

    return {
      rows: rows.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "")),
      kpis: {
        total_billed: sum(rows),
        total_paid: sum(rows.filter((r) => r.status === "paid")),
        total_pending: sum(rows.filter((r) => r.status === "pending")),
        total_overdue: sum(rows.filter((r) => r.status === "pending" && r.due_date < today)),
      },
    };
  },

  async markPaid(id) {
    if (!id) throw new Error("ID do pagamento é obrigatório.");
    const { error } = await supabase
      .from("payments")
      .update({ status: "paid", paid_at: new Date().toISOString(), canceled_at: null, cancel_note: null })
      .eq("id", id);
    if (error) mapErr("markPaid", error);
    return true;
  },

  async cancelPayment(id, note) {
    if (!id) throw new Error("ID do pagamento é obrigatório.");
    const { error } = await supabase
      .from("payments")
      .update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_note: note || null, paid_at: null })
      .eq("id", id);
    if (error) mapErr("cancelPayment", error);
    return true;
  },

  async reopenPayment(id) {
    if (!id) throw new Error("ID do pagamento é obrigatório.");
    const { error } = await supabase
      .from("payments")
      .update({ status: "pending", paid_at: null, canceled_at: null, cancel_note: null })
      .eq("id", id);
    if (error) mapErr("reopenPayment", error);
    return true;
  },

  // ==============================
  // DESPESAS — Templates
  // ==============================
  async listExpenseTemplates(opts = {}) {
    const { active = true } = opts;

    let q = supabase
      .from("expense_templates")
      .select(
        "id, title, category, amount, frequency, due_day, due_month, cost_center, active, created_at, updated_at"
      )
      .order("title", { ascending: true });

    if (active === true) q = q.eq("active", true);

    const { data, error } = await q;
    if (error) throw new Error(`listExpenseTemplates: ${error.message}`);
    return data || [];
  },

  async createExpenseTemplate({
    title,
    category = null,
    amount = 0,
    frequency = "monthly",
    due_day = 5,
    due_month = null,
    cost_center = "PJ",
    tenant_id = null,
    active = true,
  }) {
    if (!title || String(title).trim() === "") {
      throw new Error("createExpenseTemplate: 'title' é obrigatório");
    }

    const row = {
      title: String(title).trim(),
      category,
      amount: Number(amount) || 0,
      frequency: String(frequency),
      due_day: due_day ?? 5,
      due_month,
      cost_center: cost_center ?? "PJ",
      tenant_id,
      active: active !== false,
    };

    const { data, error } = await supabase
      .from("expense_templates")
      .insert([row])
      .select(
        "id, title, category, amount, frequency, due_day, due_month, cost_center, active, created_at, updated_at"
      )
      .single();

    if (error) throw new Error(`createExpenseTemplate: ${error.message}`);
    return data;
  },

  // ==============================
  // DESPESAS — Entries
  // ==============================
  async listExpenseEntries({ ym, status = "all" } = {}) {
    const monthStart = monthStartOf(ym);

    let q = supabase
      .from("expense_entries")
      .select(
        "id, template_id, title_snapshot, category, amount, competence_month, due_date, status, paid_at, canceled_at, cancel_note, cost_center, created_at, updated_at"
      )
      .eq("competence_month", monthStart)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (status && status !== "all") q = q.eq("status", status);

    const { data, error } = await q;
    if (error) throw new Error(`listExpenseEntries: ${error.message}`);

    const today = tzToday("America/Sao_Paulo");
    const rows = (data || []).map((p) => ({
      ...p,
      days_overdue:
        p.status === "pending" && p.due_date < today
          ? Math.max(0, Math.floor((new Date(today) - new Date(p.due_date)) / 86400000))
          : 0,
    }));

    const sum = (arr) => arr.reduce((acc, it) => acc + Number(it.amount || 0), 0);

    return {
      rows,
      kpis: {
        total: sum(rows),
        paid: sum(rows.filter((r) => r.status === "paid")),
        pending: sum(rows.filter((r) => r.status === "pending")),
        overdue: sum(rows.filter((r) => r.status === "pending" && r.due_date < today)),
      },
    };
  },

  async createExpenseEntry({
    ym,
    template_id = null,
    title = null,
    category = null,
    amount = null,
    due_day = null,
    due_date = null,
    cost_center = null,
  } = {}) {
    const monthStart = monthStartOf(ym);

    let t = null;
    if (template_id) {
      const { data: tpl, error: eTpl } = await supabase
        .from("expense_templates")
        .select("id, title, category, amount, frequency, due_day, due_month, cost_center, active")
        .eq("id", template_id)
        .single();
      if (eTpl) throw new Error(`createExpenseEntry (template): ${eTpl.message}`);
      if (!tpl) throw new Error("createExpenseEntry: template não encontrado");
      t = tpl;
    }

    const finalTitle = (title ?? t?.title ?? "").trim();
    if (!finalTitle) throw new Error("createExpenseEntry: 'title' é obrigatório (direto ou via template)");

    const finalCategory  = category  ?? t?.category ?? null;
    const finalAmount    = Number(amount ?? t?.amount ?? 0) || 0;
    const finalCost      = cost_center ?? t?.cost_center ?? "PJ";
    const finalDueDay    = Number(due_day ?? t?.due_day ?? 5) || 5;

    let finalDueDate = due_date;
    if (!finalDueDate) finalDueDate = dueDateFor(monthStart.slice(0, 7), finalDueDay);

    const row = {
      template_id: t?.id ?? null,
      title_snapshot: finalTitle,
      category: finalCategory,
      amount: finalAmount,
      competence_month: monthStart,
      due_date: finalDueDate,
      status: "pending",
      paid_at: null,
      canceled_at: null,
      cancel_note: null,
      cost_center: finalCost,
    };

    const { data, error } = await supabase
      .from("expense_entries")
      .insert([row])
      .select(
        "id, template_id, title_snapshot, category, amount, competence_month, due_date, status, paid_at, canceled_at, cancel_note, cost_center, created_at, updated_at"
      )
      .single();

    if (error) throw new Error(`createExpenseEntry: ${error.message}`);
    return data;
  },

  async updateExpenseTemplate(id, changes = {}) {
    if (!id) throw new Error("updateExpenseTemplate: 'id' é obrigatório");

    const patch = {};
    if (changes.title !== undefined) {
      const t = String(changes.title || "").trim();
      if (!t) throw new Error("updateExpenseTemplate: 'title' não pode ficar vazio");
      patch.title = t;
    }
    if (changes.category !== undefined)     patch.category   = changes.category ?? null;
    if (changes.amount !== undefined)       patch.amount     = Number(changes.amount || 0);
    if (changes.frequency !== undefined)    patch.frequency  = String(changes.frequency || "monthly");
    if (changes.due_day !== undefined)      patch.due_day    = clampDay1to28(changes.due_day);
    if (changes.due_month !== undefined)    patch.due_month  = changes.due_month ?? null; // 1..12 ou null
    if (changes.cost_center !== undefined)  patch.cost_center= changes.cost_center ?? "PJ";
    if (changes.active !== undefined)       patch.active     = !!changes.active;

    const { data, error } = await supabase
      .from("expense_templates")
      .update(patch)
      .eq("id", id)
      .select(
        "id, title, category, amount, frequency, due_day, due_month, cost_center, active, created_at, updated_at"
      )
      .single();

    if (error) throw new Error(`updateExpenseTemplate: ${error.message}`);
    return data;
  },

  async deleteExpenseTemplate(id) {
    if (!id) throw new Error("deleteExpenseTemplate: 'id' é obrigatório");
    const { error } = await supabase
      .from("expense_templates")
      .delete()
      .eq("id", id);
    if (error) throw new Error(`deleteExpenseTemplate: ${error.message}`);
    return true;
  },

  async createOneOffExpense({
    date,           // "YYYY-MM-DD"
    amount,
    title,
    category = null,
    cost_center = "PJ",
  }) {
    const d = String(date || "").slice(0, 10);
    if (!d) throw new Error("createOneOffExpense: 'date' é obrigatório (YYYY-MM-DD)");
    if (!title || String(title).trim() === "") {
      throw new Error("createOneOffExpense: 'title' é obrigatório");
    }

    const ym = d.slice(0, 7); // "YYYY-MM"
    const monthStart = `${ym}-01`;

    const row = {
      template_id: null,
      title_snapshot: String(title).trim(),
      category: category ?? null,
      amount: Number(amount || 0),
      competence_month: monthStart,
      due_date: d,
      status: "pending",
      paid_at: null,
      canceled_at: null,
      cancel_note: null,
      cost_center: cost_center ?? "PJ",
    };

    const { data, error } = await supabase
      .from("expense_entries")
      .insert([row])
      .select(
        "id, template_id, title_snapshot, category, amount, competence_month, due_date, status, paid_at, canceled_at, cancel_note, cost_center, created_at, updated_at"
      )
      .single();

    if (error) throw new Error(`createOneOffExpense: ${error.message}`);
    return data;
  },

  async markExpensePaid(id) {
    if (!id) throw new Error("markExpensePaid: 'id' é obrigatório");
    const { error } = await supabase
      .from("expense_entries")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        canceled_at: null,
        cancel_note: null,
      })
      .eq("id", id);
    if (error) throw new Error(`markExpensePaid: ${error.message}`);
    return true;
  },

  async cancelExpense(id, note = null) {
    if (!id) throw new Error("cancelExpense: 'id' é obrigatório");
    const { error } = await supabase
      .from("expense_entries")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        cancel_note: note || null,
        paid_at: null,
      })
      .eq("id", id);
    if (error) throw new Error(`cancelExpense: ${error.message}`);
    return true;
  },

  async reopenExpense(id) {
    if (!id) throw new Error("reopenExpense: 'id' é obrigatório");
    const { error } = await supabase
      .from("expense_entries")
      .update({
        status: "pending",
        paid_at: null,
        canceled_at: null,
        cancel_note: null,
      })
      .eq("id", id);
    if (error) throw new Error(`reopenExpense: ${error.message}`);
    return true;
  },

  async previewGenerateExpenses({ ym, cost_center = null } = {}) {
    const monthStart = monthStartOf(ym);
    const [Y, M] = monthStart.slice(0, 7).split("-").map(Number);

    let qt = supabase
      .from("expense_templates")
      .select("id, title, category, amount, frequency, due_day, due_month, cost_center, active")
      .eq("active", true);
    if (cost_center) qt = qt.eq("cost_center", cost_center);

    const { data: templates, error: eT } = await qt;
    if (eT) throw new Error(`previewGenerateExpenses (templates): ${eT.message}`);

    const { data: existing, error: eX } = await supabase
      .from("expense_entries")
      .select("template_id")
      .eq("competence_month", monthStart);
    if (eX) throw new Error(`previewGenerateExpenses (existing): ${eX.message}`);

    const existingSet = new Set((existing || []).map((r) => r.template_id).filter(Boolean));

    const preview = [];
    for (const t of (templates || [])) {
      if (String(t.frequency || "monthly") === "yearly") {
        if (!t.due_month || Number(t.due_month) !== M) continue;
      }
      if (existingSet.has(t.id)) continue;

      const day = clampDay1to28(t.due_day);
      const due_date = `${Y}-${String(M).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      preview.push({
        template_id: t.id,
        title_snapshot: t.title,
        category: t.category,
        amount: Number(t.amount || 0),
        competence_month: monthStart,
        due_date,
        status: "pending",
        cost_center: t.cost_center || "PJ",
        _from_template: true,
      });
    }

    return preview;
  },

  async generateExpenses({ ym, cost_center = null } = {}) {
    const monthStart = monthStartOf(ym);
    const [Y, M] = monthStart.slice(0, 7).split("-").map(Number);

    let qt = supabase
      .from("expense_templates")
      .select("id, title, category, amount, frequency, due_day, due_month, cost_center, active")
      .eq("active", true);
    if (cost_center) qt = qt.eq("cost_center", cost_center);

    const { data: templates, error: eT } = await qt;
    if (eT) throw new Error(`generateExpenses (templates): ${eT.message}`);

    const { data: existing, error: eX } = await supabase
      .from("expense_entries")
      .select("template_id")
      .eq("competence_month", monthStart);
    if (eX) throw new Error(`generateExpenses (existing): ${eX.message}`);

    const existingSet = new Set((existing || []).map((r) => r.template_id).filter(Boolean));

    const toInsert = [];
    for (const t of (templates || [])) {
      if (String(t.frequency || "monthly") === "yearly") {
        if (!t.due_month || Number(t.due_month) !== M) continue;
      }
      if (existingSet.has(t.id)) continue;

      const day = Math.min(Math.max(Number(t.due_day || 5), 1), 28);
      const due_date = `${Y}-${String(M).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      toInsert.push({
        template_id: t.id,
        title_snapshot: t.title,
        category: t.category,
        amount: Number(t.amount || 0),
        competence_month: monthStart,
        due_date,
        status: "pending",
        paid_at: null,
        canceled_at: null,
        cancel_note: null,
        cost_center: t.cost_center || "PJ",
      });
    }

    if (toInsert.length === 0) return 0;

    const { error: eI } = await supabase.from("expense_entries").insert(toInsert);
    if (!eI) return toInsert.length;

    if (eI.code === "23505") {
      let inserted = 0;
      for (const row of toInsert) {
        const { error } = await supabase.from("expense_entries").insert(row);
        if (error && error.code !== "23505") {
          throw new Error(`generateExpenses (insert row): ${error.message}`);
        }
        if (!error) inserted += 1;
      }
      return inserted;
    }

    throw new Error(`generateExpenses (insert): ${eI.message}`);
  },

  // ==============================
  // FINANCEIRO — KPIs Agregados
  // ==============================
  async getMonthlyFinanceKpis({ ym, cost_center = null }) {
    const monthStart = monthStartOf(ym);
    const today = tzToday("America/Sao_Paulo");

    const { data: payRows, error: e1 } = await supabase
      .from("payments")
      .select("amount,status,due_date")
      .eq("competence_month", monthStart);
    if (e1) mapErr("getMonthlyFinanceKpis.payments", e1);

    const sum = (arr) => arr.reduce((a, b) => a + Number(b.amount || 0), 0);
    const revenue = {
      total_billed: sum(payRows || []),
      paid: sum((payRows || []).filter(r => r.status === "paid")),
      pending: sum((payRows || []).filter(r => r.status === "pending")),
      overdue: sum((payRows || []).filter(r => r.status === "pending" && r.due_date < today)),
    };

    let q = supabase
      .from("expense_entries")
      .select("amount,status,due_date,cost_center")
      .eq("competence_month", monthStart);
    if (cost_center) q = q.eq("cost_center", cost_center);

    const { data: expRows, error: e2 } = await q;
    if (e2) mapErr("getMonthlyFinanceKpis.expenses", e2);

    const expense = {
      total: sum(expRows || []),
      paid: sum((expRows || []).filter(r => r.status === "paid")),
      pending: sum((expRows || []).filter(r => r.status === "pending")),
      overdue: sum((expRows || []).filter(r => r.status === "pending" && r.due_date < today)),
    };

    const net = revenue.paid - expense.paid;

    const by_cost_center_map = {};
    for (const r of (expRows || [])) {
      const cc = r.cost_center || "N/A";
      if (!by_cost_center_map[cc]) {
        by_cost_center_map[cc] = { total: 0, paid: 0, pending: 0, overdue: 0 };
      }
      by_cost_center_map[cc].total += Number(r.amount || 0);
      if (r.status === "paid") by_cost_center_map[cc].paid += Number(r.amount || 0);
      if (r.status === "pending") {
        by_cost_center_map[cc].pending += Number(r.amount || 0);
        if (r.due_date < today) by_cost_center_map[cc].overdue += Number(r.amount || 0);
      }
    }
    const by_cost_center = Object.entries(by_cost_center_map).map(([cost_center, v]) => ({ cost_center, ...v }));

    return { revenue, expense, net, by_cost_center };
  },

  // ==============================
  // OUTRAS RECEITAS
  // ==============================
  async listOtherRevenues({ ym, status = "all" } = {}) {
    const monthStart = monthStartOf(ym);

    let q = supabase
      .from("other_revenues")
      .select(
        "id, title, category, amount, competence_month, due_date, status, paid_at, canceled_at, cancel_note, cost_center, created_at, updated_at"
      )
      .eq("competence_month", monthStart)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (status && status !== "all") q = q.eq("status", status);

    const { data, error } = await q;
    if (error) throw new Error(`listOtherRevenues: ${error.message}`);

    const today = tzToday("America/Sao_Paulo");
    const rows = (data || []).map((r) => ({
      ...r,
      days_overdue:
        r.status === "pending" && r.due_date < today
          ? Math.max(0, Math.floor((new Date(today) - new Date(r.due_date)) / 86400000))
          : 0,
    }));

    const sum = (arr) => arr.reduce((acc, it) => acc + Number(it.amount || 0), 0);

    return {
      rows,
      kpis: {
        total:   sum(rows),
        paid:    sum(rows.filter((x) => x.status === "paid")),
        pending: sum(rows.filter((x) => x.status === "pending")),
        overdue: sum(rows.filter((x) => x.status === "pending" && x.due_date < today)),
      },
    };
  },

  async createOtherRevenue({
    ym,
    title,
    amount,
    due_date = null,
    category = null,
    cost_center = "extra",
  } = {}) {
    const monthStart = monthStartOf(ym);

    const finalTitle = String(title || "").trim();
    if (!finalTitle) throw new Error("createOtherRevenue: 'title' é obrigatório");

    const finalAmount = Number(amount || 0);
    const finalDueDate = due_date
      ? String(due_date).slice(0, 10)
      : dueDateFor(monthStart.slice(0, 7), 5);

    const row = {
      title: finalTitle,
      category: category ?? null,
      amount: finalAmount,
      competence_month: monthStart,
      due_date: finalDueDate,
      status: "pending",
      paid_at: null,
      canceled_at: null,
      cancel_note: null,
      cost_center: cost_center ?? "extra",
    };

    const { data, error } = await supabase
      .from("other_revenues")
      .insert([row])
      .select(
        "id, title, category, amount, competence_month, due_date, status, paid_at, canceled_at, cancel_note, cost_center, created_at, updated_at"
      )
      .single();

    if (error) throw new Error(`createOtherRevenue: ${error.message}`);
    return data;
  },

  async markOtherRevenuePaid(id) {
    if (!id) throw new Error("markOtherRevenuePaid: 'id' é obrigatório");
    const { error } = await supabase
      .from("other_revenues")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        canceled_at: null,
        cancel_note: null,
      })
      .eq("id", id);
    if (error) throw new Error(`markOtherRevenuePaid: ${error.message}`);
    return true;
  },

  async cancelOtherRevenue(id, note = null) {
    if (!id) throw new Error("cancelOtherRevenue: 'id' é obrigatório");
    const { error } = await supabase
      .from("other_revenues")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        cancel_note: note || null,
        paid_at: null,
      })
      .eq("id", id);
    if (error) throw new Error(`cancelOtherRevenue: ${error.message}`);
    return true;
  },

  async reopenOtherRevenue(id) {
    if (!id) throw new Error("reopenOtherRevenue: 'id' é obrigatório");
    const { error } = await supabase
      .from("other_revenues")
      .update({
        status: "pending",
        paid_at: null,
        canceled_at: null,
        cancel_note: null,
      })
      .eq("id", id);
    if (error) throw new Error(`reopenOtherRevenue: ${error.message}`);
    return true;
  },

  // ==============================
  // PROFESSORES — Payout por mês
  // ==============================
  async sumTeacherPayoutByMonth(teacherId, ym) {
    if (!teacherId) throw new Error("sumTeacherPayoutByMonth: 'teacherId' é obrigatório");
    const monthStart = monthStartOf(ym);

    const [Y, M] = monthStart.slice(0, 7).split("-").map(Number);
    const nextY = M === 12 ? Y + 1 : Y;
    const nextM = M === 12 ? 1 : M + 1;
    const nextMonthStart = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

    const { data: teacher, error: eT } = await supabase
      .from("teachers")
      .select("id, hourly_rate, pay_day, rate_mode, rate_rules, status")
      .eq("id", teacherId)
      .single();
    if (eT) mapErr("sumTeacherPayoutByMonth.teacher", eT);
    if (!teacher) return { hours: 0, sessions: 0, amount: 0, hourly_rate: 0, pay_day: 5 };

    const rateMode = teacher.rate_mode === "by_size" ? "by_size" : "flat";
    const baseHourly = Number(teacher.hourly_rate || 0);
    const rules = Array.isArray(teacher.rate_rules) ? teacher.rate_rules : [];

    const { data: sess, error: eS } = await supabase
      .from("sessions")
      .select("id,date,duration_hours,headcount_snapshot,turmas!inner(id,teacher_id)")
      .gte("date", monthStart)
      .lt("date", nextMonthStart)
      .eq("turmas.teacher_id", teacherId);
    if (eS) mapErr("sumTeacherPayoutByMonth.sessions", eS);

    let totalHours = 0;
    let totalAmount = 0;
    let count = 0;

    function hourlyBySize(headcount) {
      if (!rules.length) return baseHourly;
      const n = Number(headcount || 0) > 0 ? Number(headcount) : 1;
      let match = rules.find(r =>
        (r && (r.min == null || n >= Number(r.min))) &&
        (r.max == null || n <= Number(r.max))
      );
      if (!match) {
        const sorted = [...rules].sort((a, b) => Number(a.min || 0) - Number(b.min || 0));
        match = sorted[0];
      }
      const hr = Number(match?.hourly_rate || baseHourly || 0);
      return hr;
    }

    for (const s of (sess || [])) {
      const h = Number(s.duration_hours || 0);
      if (h <= 0) continue;
      count += 1;
      totalHours += h;

      const hourly =
        rateMode === "by_size" ? hourlyBySize(s.headcount_snapshot) : baseHourly;

      totalAmount += h * Number(hourly || 0);
    }

    return {
      hours: Number(totalHours || 0),
      sessions: count,
      amount: Number(totalAmount || 0),
      hourly_rate: baseHourly,
      pay_day: Number(teacher.pay_day || 5),
    };
  },

  async listTeacherSessionsByMonth(teacherId, ym) {
    if (!teacherId) throw new Error("listTeacherSessionsByMonth: 'teacherId' é obrigatório");
    const monthStart = monthStartOf(ym);
    const [Y, M] = monthStart.slice(0, 7).split("-").map(Number);
    const nextY = M === 12 ? Y + 1 : Y;
    const nextM = M === 12 ? 1 : M + 1;
    const nextMonthStart = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

    const { data: teacher, error: eT } = await supabase
      .from("teachers")
      .select("id, hourly_rate, pay_day, rate_mode, rate_rules")
      .eq("id", teacherId)
      .single();
    if (eT) mapErr("listTeacherSessionsByMonth.teacher", eT);
    if (!teacher) return [];

    const rateMode = teacher.rate_mode === "by_size" ? "by_size" : "flat";
    const baseHourly = Number(teacher.hourly_rate || 0);
    const rules = Array.isArray(teacher.rate_rules) ? teacher.rate_rules : [];

    const { data: sess, error: eS } = await supabase
      .from("sessions")
      .select("id,date,duration_hours,headcount_snapshot,turma_id,turmas!inner(id,name,teacher_id)")
      .gte("date", monthStart)
      .lt("date", nextMonthStart)
      .eq("turmas.teacher_id", teacherId)
      .order("date", { ascending: true });
    if (eS) mapErr("listTeacherSessionsByMonth.sessions", eS);

    function hourlyBySize(headcount) {
      if (!rules.length) return baseHourly;
      const n = Number(headcount || 0) > 0 ? Number(headcount) : 1;
      let match = rules.find(r =>
        (r && (r.min == null || n >= Number(r.min))) &&
        (r.max == null || n <= Number(r.max))
      );
      if (!match) {
        const sorted = [...rules].sort((a, b) => Number(a.min || 0) - Number(b.min || 0));
        match = sorted[0];
      }
      return Number(match?.hourly_rate || baseHourly || 0);
    }

    const rows = (sess || []).map(s => {
      const h = Number(s.duration_hours || 0);
      const hourly = rateMode === "by_size" ? hourlyBySize(s.headcount_snapshot) : baseHourly;
      const amount = h * Number(hourly || 0);
      const toIso = (d) => (d ? new Date(d).toISOString() : null);
      return {
        id: s.id,
        date: toIso(s.date),              // <- evita "Invalid Date" no modal
        turma_id: s.turma_id,
        turma_name: s.turmas?.name || "",
        duration_hours: h,
        headcount_snapshot: s.headcount_snapshot ?? null,
        hourly_applied: Number(hourly || 0),
        amount: Number(amount || 0),
      };
    });

    return rows;
  },

  // ==============================
  // FINANCEIRO — Resumo do mês (com custo de professores)
  // ==============================
  async getMonthlyFinancialSummary({ ym, costCenter = null } = {}) {
    const payments = await this.listPayments({ ym });
    const expenses = await this.listExpenseEntries({ ym });

    const teachers = await this.listTeachers();
    let professores = 0;
    for (const t of teachers || []) {
      const p = await this.sumTeacherPayoutByMonth(t.id, ym);
      professores += Number(p?.amount || 0);
    }

    const receita = Number(payments?.kpis?.total_billed || 0);
    const rowsExp = (expenses?.rows || expenses || []).filter((e) => e.status !== "canceled");
    const despesas = rowsExp.reduce((acc, e) => acc + Number(e.amount || 0), 0);

    const saldo = receita - despesas;
    const saldo_operacional = receita - despesas - professores;

    return {
      receita,
      despesas,
      professores,
      saldo,
      saldo_operacional,
    };
  },
};

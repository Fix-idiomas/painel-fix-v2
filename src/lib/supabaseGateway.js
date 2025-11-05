import { supabase } from "./supabaseClient";

// ------------------------ Helpers ------------------------
 const mapErr = (ctx, err) => {
   const code = err?.code || err?.status || err?.name;
   const text = `${err?.message || ""} ${err?.details || ""}`.toLowerCase();

   // teacher_id_snapshot NOT NULL → mensagem amigável
   if (
     code === "23502" ||                // not_null_violation (Postgres)
     text.includes("null value in column") ||
     text.includes("violates not-null constraint")
   ) {
     if (text.includes("teacher_id_snapshot")) {
       console.error(`[supabaseGateway] ${ctx}:`, err);
       throw new Error("É obrigatório atribuir um professor à turma para criar uma sessão.");
     }
   }

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
// normaliza 'DD/MM/YYYY' ou 'DD.MM.YYYY' para 'YYYY-MM-DD'
function normalizeDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (/^\d{2}[./]\d{2}[./]\d{4}$/.test(t)) {
    const [dd, mm, yyyy] = t.split(/[./]/);
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t; // já ISO
  return t.slice(0, 10); // fallback
}

// ========================================================

export const supabaseGateway = {
  // helper para obter tenant_id do contexto RLS
  async getTenantId() {
    const { data, error } = await supabase.rpc("current_tenant_id");
    if (error || !data) throw new Error("tenant_id indisponível no contexto");
    return data; // uuid
  },
  // ==============================
  // ALUNOS (CRUD + evolução)
  // ==============================
  async listStudents() {
    const { data, error } = await supabase
      .from("students")
      .select("id,name,status,monthly_value,due_day,birth_date,payer_id,email,endereco,cpf")
      .order("name", { ascending: true });
    if (error) mapErr("listStudents", error);
    return data || [];
  },

  async createStudent(payload) {
    const {
      name,
      monthly_value,
      due_day,
      birth_date = null,
      status = "ativo",
      payer_id = null,
      email = null,
      endereco = null,
      cpf = null,
    } = payload || {};
    if (!name) throw new Error("Nome é obrigatório");
    const tenant_id = await this.getTenantId();

    const row = {
      name: String(name).trim(),
      monthly_value: Number(monthly_value || 0),
      due_day: clampDay1to28(due_day),
      birth_date: birth_date || null,
      status: status || "ativo",
      payer_id: payer_id || null,
      email: email ? String(email).trim().toLowerCase() : null,
      endereco: endereco ? String(endereco).trim() : null,
      cpf: cpf ? String(cpf).trim() : null,
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("students")
      .insert(row)
      .select("id,name,tenant_id,status,monthly_value,due_day,birth_date,payer_id,email,endereco,cpf")
      .single();
    if (error) mapErr("createStudent", error);
    return data;
  },

async updateStudent(id, changes = {}) {
  if (!id) throw new Error("updateStudent: 'id' é obrigatório");

  const patch = {};

  // name (obrigatório se vier)
  if (changes.name !== undefined) {
    const nm = String(changes.name || "").trim();
    if (!nm) throw new Error("updateStudent: 'name' é obrigatório");
    patch.name = nm;
  }

  // monthly_value (numeric)
  if (changes.monthly_value !== undefined) {
    patch.monthly_value = Number(changes.monthly_value || 0);
  }

  // due_day (1..28)
  if (changes.due_day !== undefined) {
    const d = Number(changes.due_day);
    if (!Number.isInteger(d) || d < 1 || d > 28) {
      throw new Error("updateStudent: 'due_day' deve ser inteiro entre 1 e 28");
    }
    patch.due_day = d;
  }

  // birth_date (YYYY-MM-DD) ou null
  if (changes.birth_date !== undefined) {
    patch.birth_date = changes.birth_date ? String(changes.birth_date).slice(0, 10) : null;
  }

  // payer_id (uuid ou null)
  if (changes.payer_id !== undefined) {
    patch.payer_id = changes.payer_id || null;
  }

  // email (trim + lower; null se vazio)
  if (changes.email !== undefined) {
    const em = String(changes.email || "").trim();
    patch.email = em ? em.toLowerCase() : null;
  }

  // endereco (trim; null se vazio)
  if (changes.endereco !== undefined) {
    const en = String(changes.endereco || "").trim();
    patch.endereco = en || null;
  }

  // cpf (aceita com/sem máscara; null se vazio)
  if (changes.cpf !== undefined) {
    const cpf = String(changes.cpf || "").trim();
    patch.cpf = cpf || null;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("updateStudent: nada para atualizar");
  }

  const { data, error } = await supabase
    .from("students")
    .update(patch)
    .eq("id", id)
    .select("id, name, status, monthly_value, due_day, birth_date, payer_id, email, endereco, cpf, updated_at")
    .single();

  if (error) {
    const msg = String(error.message || "");
    if (msg.toLowerCase().includes("foreign key")) {
      throw new Error("Pagador inválido: verifique o pagador selecionado.");
    }
    throw new Error(`updateStudent: ${msg}`);
  }
  return data;
},


async setStudentStatus(id, status) {
  if (!id) throw new Error("setStudentStatus: 'id' é obrigatório");
  if (!["ativo", "inativo"].includes(status)) {
    throw new Error("setStudentStatus: status inválido (use 'ativo' ou 'inativo')");
  }

  const { data, error } = await supabase
    .from("students")
    .update({ status })
    .eq("id", id)
    .select("id, name, status, updated_at")
    .single();

  if (error) throw new Error(`setStudentStatus: ${error.message}`);
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
  if (!studentId) throw new Error("listAttendanceByStudent: 'studentId' é obrigatório");

  // 1) Presenças do aluno
  const { data: atts, error: e1 } = await supabase
    .from("attendance")
    .select("session_id, student_id, present, note, created_at, updated_at, tenant_id")
    .eq("student_id", studentId);
  if (e1) throw new Error(e1.message);

  const sessionIds = [...new Set((atts || []).map(a => a.session_id))];
  if (sessionIds.length === 0) return [];

  // 2) Sessões
  const { data: sessions, error: e2 } = await supabase
    .from("sessions")
    .select("id, date, turma_id")
    .in("id", sessionIds);
  if (e2) throw new Error(e2.message);
  const mapSession = new Map((sessions || []).map(s => [s.id, s]));

  // 3) Turmas (para obter o nome)
  const turmaIds = [...new Set((sessions || []).map(s => s.turma_id).filter(Boolean))];
  let mapTurma = new Map();
  if (turmaIds.length) {
    const { data: turmas, error: e3 } = await supabase
      .from("turmas")
      .select("id, name")
      .in("id", turmaIds);
    if (e3) throw new Error(e3.message);
    mapTurma = new Map((turmas || []).map(t => [t.id, t]));
  }
const toIso = (v) => {
    if (!v) return null;
    const s = String(v).trim();
    const onlyDate = /^\d{4}-\d{2}-\d{2}$/.test(s);
    const safe = onlyDate ? `${s}T00:00:00` : s.slice(0, 25);
    const d = new Date(safe);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const out = (atts || []).map((a) => {
    const s = mapSession.get(a.session_id);
    const turmaName = s ? mapTurma.get(s.turma_id)?.name ?? null : null;
    return {
      key: `${a.session_id}:${a.student_id}`,
      session_id: a.session_id,
      student_id: a.student_id,
      present: !!a.present,
      note: a.note,
      created_at: a.created_at,
      updated_at: a.updated_at,
      tenant_id: a.tenant_id,
      // snapshots consumidos pela UI
      session_date_snapshot: toIso(s?.date),
      turma_name_snapshot: turmaName,
    };
  });

   // 6) Ordena por data da sessão (fallback created_at)
  out.sort((a, b) =>
    String(a.session_date_snapshot || a.created_at || "")
      .localeCompare(String(b.session_date_snapshot || b.created_at || ""))
  );

  return out;
},



  // ==============================
  // PROFESSORES (CRUD + list)
  // ==============================
  async listTeachers() {
    const { data, error } = await supabase
      .from("teachers")
      .select("id,name,email, phone, user_id, status, hourly_rate, pay_day, rate_mode, rate_rules")
      .order("name", { ascending: true });
    if (error) mapErr("listTeachers", error);
    return data || [];
  },

// Criar professor
async createTeacher(payload = {}) {
  const row = {
    name: String(payload.name || "").trim(),
    email: payload.email ? String(payload.email).trim() : null,
    phone: payload.phone ? String(payload.phone).trim() : null,
    status: payload.status === "inativo" ? "inativo" : "ativo",
    hourly_rate: Number(payload.hourly_rate || 0),
    pay_day: (() => {
      const d = Number(payload.pay_day || 5);
      if (!Number.isInteger(d) || d < 1 || d > 28) throw new Error("createTeacher: 'pay_day' deve ser 1..28");
      return d;
    })(),
    rate_mode: payload.rate_mode === "by_size" ? "by_size" : "flat",
    rate_rules: Array.isArray(payload.rate_rules) ? payload.rate_rules : [],
  };

  if (!row.name) throw new Error("createTeacher: 'name' é obrigatório");

  const { data, error } = await supabase
    .from("teachers")
    .insert([row])
    .select("id, name, email, phone, status, hourly_rate, pay_day, rate_mode, rate_rules, created_at")
    .single();

  if (error) throw new Error(`createTeacher: ${error.message}`);
  return data;
},

// Atualizar professor
// Atualizar professor (normaliza rate_rules -> hourly_rate)
async updateTeacher(id, changes = {}) {
  if (!id) throw new Error("updateTeacher: 'id' é obrigatório");

  const patch = {};
  if (changes.name !== undefined)        patch.name = String(changes.name || "").trim();
  if (changes.email !== undefined)       patch.email = changes.email ? String(changes.email).trim() : null;
  if (changes.phone !== undefined)       patch.phone = changes.phone ? String(changes.phone).trim() : null;
  if (changes.status !== undefined)      patch.status = changes.status === "inativo" ? "inativo" : "ativo";
  if (changes.hourly_rate !== undefined) patch.hourly_rate = Number(changes.hourly_rate || 0);

  if (changes.pay_day !== undefined) {
    const d = Number(changes.pay_day);
    if (!Number.isInteger(d) || d < 1 || d > 28) {
      throw new Error("updateTeacher: 'pay_day' deve ser 1..28");
    }
    patch.pay_day = d;
  }

  if (changes.rate_mode !== undefined) {
    patch.rate_mode = changes.rate_mode === "by_size" ? "by_size" : "flat";
  }

  if (changes.rate_rules !== undefined) {
    const toNum = (v) => {
      const n = Number(String(v ?? "").trim());
      return Number.isFinite(n) ? n : null;
    };
    const arr = Array.isArray(changes.rate_rules) ? changes.rate_rules : [];
    // Form do modal usa { min, max, rate } (strings). Persistir como { min, max, hourly_rate } (números).
    const normalized = arr
      .map((r) => ({
        min:         toNum(r.min),
        max:         toNum(r.max),
        hourly_rate: toNum(r.rate ?? r.hourly_rate),
      }))
      // opcional: remove regras sem valor de hora
      .filter((r) => r.hourly_rate !== null);

    patch.rate_rules = normalized;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("updateTeacher: nada para atualizar");
  }

  const { data, error } = await supabase
    .from("teachers")
    .update(patch)
    .eq("id", id)
    .select("id, name, email, phone, status, hourly_rate, pay_day, rate_mode, rate_rules, updated_at")
    .maybeSingle();

  if (error) throw new Error(`updateTeacher: ${error.message}`);
  return data;
},


  async setTeacherStatus(id, status) {
  if (!id) throw new Error("setTeacherStatus: 'id' é obrigatório");

  if (!["ativo", "inativo"].includes(status)) {
    throw new Error("setTeacherStatus: status inválido (use 'ativo' ou 'inativo')");
  }
   const { data, error } = await supabase
    .from("teachers")
    .update({ status })
    .eq("id", id)
    .select("id, name, email, phone, status, hourly_rate, pay_day, rate_mode, rate_rules, updated_at")
    .maybeSingle();

  if (error) throw new Error(`setTeacherStatus: ${error.message}`);
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
async listPayers({ status = "all" } = {}) {
  let q = supabase
    .from("payers") // ajuste se sua tabela tiver outro nome
    .select("id, name, email, created_at")
    .order("name", { ascending: true });

  // se você tiver coluna 'status', descomente:
  // if (status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) throw new Error(`listPayers: ${error.message}`);
  return data || [];
},


async createPayer({ name, email = null }) {
  const nm = String(name || "").trim();
  if (!nm) throw new Error("createPayer: 'name' é obrigatório");

  const { data, error } = await supabase
    .from("payers")
    .insert([{ name: nm, email: email || null }])
    .select("id, name, email, created_at")
    .single();

  if (error) throw new Error(`createPayer: ${error.message}`);
  return data;
},

async updatePayer(id, changes = {}) {
  if (!id) throw new Error("updatePayer: 'id' é obrigatório");

  const patch = {};
  if (changes.name !== undefined)  patch.name  = String(changes.name || "").trim();
  if (changes.email !== undefined) patch.email = changes.email ? String(changes.email).trim() : null;

  if (!patch.name) throw new Error("updatePayer: 'name' é obrigatório");

  const { data, error } = await supabase
    .from("payers")
    .update(patch)
    .eq("id", id)
    .select("id, name, email, created_at")
    .single();

  if (error) throw new Error(`updatePayer: ${error.message}`);
  return data;
},

async deletePayer(id) {
  if (!id) throw new Error("deletePayer: 'id' é obrigatório");

  // se existir FK (ex.: payments.payer_id), o Supabase vai bloquear e retornar erro.
  const { error } = await supabase
    .from("payers")
    .delete()
    .eq("id", id);

  if (error) {
    // mensagem amigável quando houver violação de FK/uso em alunos/lançamentos
    if (String(error.message).toLowerCase().includes("foreign key")) {
      throw new Error("Não é possível excluir: pagador em uso por alunos/lançamentos.");
    }
    throw new Error(`deletePayer: ${error.message}`);
  }
  return { success: true };
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
  if (!turmaId) throw new Error("listTurmaMembers: 'turmaId' é obrigatório");

  const { data: links, error: e1 } = await supabase
    .from("turma_members")
    .select("student_id")
    .eq("turma_id", turmaId);

  if (e1) throw new Error(`listTurmaMembers.links: ${e1.message}`);

  // IDs únicos
  const ids = [...new Set((links || []).map((r) => r.student_id))];
  if (ids.length === 0) return [];

  const { data: students, error: e2 } = await supabase
    .from("students")
    .select("id,name,status")
    .in("id", ids)
    .order("name", { ascending: true });

  if (e2) throw new Error(`listTurmaMembers.students: ${e2.message}`);

  return students || [];
},


// ---------- Turmas (CRUD) ----------
createTurma: async function (payload = {}) {
  const name = String(payload.name || "").trim();
  if (!name) throw new Error("createTurma: 'name' é obrigatório");

  const capacity = Math.max(1, Number(payload.capacity || 20));
  const teacher_id = payload.teacher_id || null;

  const meeting_rules = Array.isArray(payload.meeting_rules)
    ? payload.meeting_rules.map((r) => ({
        weekday: (r.weekday === "" || r.weekday === undefined || r.weekday === null)
          ? null
          : Number(r.weekday),
        time: r.time || null,
        duration_hours: Number(r.duration_hours || 0.5),
      }))
    : [];

  const row = { name, teacher_id, capacity, meeting_rules };

  const { data, error } = await supabase
    .from("turmas")
    .insert([row])
    .select("id, name, teacher_id, capacity, meeting_rules, created_at, updated_at")
    .single();

  if (error) throw new Error(`createTurma: ${error.message}`);
  return data;
},

updateTurma: async function (id, changes = {}) {
  if (!id) throw new Error("updateTurma: 'id' é obrigatório");

  const patch = {};
  if (changes.name !== undefined) {
    const name = String(changes.name || "").trim();
    if (!name) throw new Error("updateTurma: 'name' não pode ser vazio");
    patch.name = name;
  }
  if (changes.teacher_id !== undefined) {
    patch.teacher_id = changes.teacher_id || null;
  }
  if (changes.capacity !== undefined) {
    patch.capacity = Math.max(1, Number(changes.capacity || 20));
  }
  if (changes.meeting_rules !== undefined) {
    patch.meeting_rules = Array.isArray(changes.meeting_rules)
      ? changes.meeting_rules.map((r) => ({
          weekday: (r.weekday === "" || r.weekday === undefined || r.weekday === null)
            ? null
            : Number(r.weekday),
          time: r.time || null,
          duration_hours: Number(r.duration_hours || 0.5),
        }))
      : [];
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("turmas")
    .update(patch)
    .eq("id", id)
    .select("id, name, teacher_id, capacity, meeting_rules, created_at, updated_at")
    .single();

  if (error) throw new Error(`updateTurma: ${error.message}`);
  return data;
},

deleteTurma: async function (id) {
  if (!id) throw new Error("deleteTurma: 'id' é obrigatório");

  // Remove dependências simples antes (sem transação no client)
  const delMembers = await supabase.from("turma_members").delete().eq("turma_id", id);
  if (delMembers.error) throw new Error(`deleteTurma (members): ${delMembers.error.message}`);

  const delSessions = await supabase.from("sessions").delete().eq("turma_id", id);
  if (delSessions.error) throw new Error(`deleteTurma (sessions): ${delSessions.error.message}`);

  const { error: eTurma } = await supabase.from("turmas").delete().eq("id", id);
  if (eTurma) throw new Error(`deleteTurma: ${eTurma.message}`);

  return true;
},

// --- Vínculo aluno-turma ---
async addStudentToTurma(turmaId, studentId) {
  if (!turmaId || !studentId) throw new Error("addStudentToTurma: turmaId e studentId são obrigatórios");
  const { data, error } = await supabase
    .from("turma_members")
    .upsert(
      { turma_id: turmaId, student_id: studentId, status: "ativo" }, // tenant_id tem default, pode omitir
      { onConflict: "turma_id,student_id" }
    )
    .select("turma_id, student_id, status, created_at, updated_at")
    .single();
  if (error) mapErr("addStudentToTurma", error);
  return data; // não há 'id'
},
async removeStudentFromTurma(turmaId, studentId) {
  if (!turmaId || !studentId) throw new Error("removeStudentFromTurma: turmaId e studentId são obrigatórios");
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
// src/lib/supabaseGateway.js
// --- Sessões (aulas) ---
async listSessions(turmaId) {
  if (!turmaId) throw new Error("listSessions: 'turmaId' é obrigatório");

  const { data, error } = await supabase
    .from("sessions")
    .select("id, turma_id, date, duration_hours, notes, headcount_snapshot, created_at, updated_at")
    .eq("turma_id", turmaId)
    .order("date", { ascending: true });

  if (error) throw new Error(`listSessions: ${error.message}`);
   // ⚙️ normaliza p/ ISO confiável
  const toIso = (d) => (d ? new Date(d).toISOString() : null);
  return (data || []).map(s => ({
    ...s,
    date: toIso(s.date),
  }));
},


// Lista sessões de uma turma num intervalo [start, end] e indica se têm presença
  async listSessionsWithAttendance({ turmaId, start, end }) {
    if (!turmaId) throw new Error("listSessionsWithAttendance: 'turmaId' é obrigatório");

    
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
      
      // RLS já limita por tenant; se quiser reforçar via app:
      // const tenant_id = await this.getTenantId();
      // .eq("tenant_id", tenant_id)
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
       // .eq("tenant_id", tenant_id) // opcional, se usar linha acima
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
      .insert([row]) // array é o padrão + seguro
      .select("id,turma_id,date,duration_hours,notes,headcount_snapshot")
      .single();
    if (error) mapErr("createSession", error);
    return data;
  },

async updateSession(id, changes) {
  if (!id || (typeof id !== "string" && typeof id !== "number")) {
    throw new Error("ID da sessão é obrigatório.");
  }

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

  // Se não há mudanças, retorna o registro atual
  if (Object.keys(patch).length === 0) {
    const { data, error } = await supabase
      .from("sessions")
      .select("id,turma_id,date,duration_hours,notes,headcount_snapshot")
      .eq("id", id)
      .limit(1);
    if (error) mapErr("updateSession.select", error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Sessão não encontrada.");
    return row;
  }

  const { data, error } = await supabase
    .from("sessions")
    .update(patch)
    .eq("id", id)
    .select("id,turma_id,date,duration_hours,notes,headcount_snapshot"); // sem .single()

  if (error) mapErr("updateSession", error);

  // Normaliza: PostgREST retorna array no UPDATE + select
  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    // 0 linhas atualizadas: ou ID não existe ou RLS bloqueou
    throw new Error("Sessão não encontrada ou sem permissão para editar.");
  }
  return row;
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

// --- Attendance ---
async listAttendance(sessionId) {
  const { data, error } = await supabase
    .from("attendance")
    .select("student_id, present, note")
    .eq("session_id", sessionId);

  if (error) mapErr("listAttendance", error);
  return data || [];
},
async deleteAttendance(sessionId, studentId) {
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("session_id", sessionId)
    .eq("student_id", studentId);

  if (error) mapErr("deleteAttendance", error);
  return true;
},
async upsertAttendance(sessionId, studentId, { present, note }) {
  const { data, error } = await supabase
    .from("attendance")
    .upsert(
      {
        session_id: sessionId,
        student_id: studentId,
        present: !!present,
        note: note || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id,student_id" }
    )
    .select();

  if (error) mapErr("upsertAttendance", error);
  return data?.[0] || null;
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
 // --- TENANT SETTINGS (usa RPCs reais) ---
async getTenantSettings() {
  const { data, error } = await supabase.rpc("get_tenant_settings");
  if (error) throw new Error(`getTenantSettings: ${error.message}`);
  // A função retorna o registro inteiro de tenant_settings como JSONB (ou {}).
  // Normalizamos com defaults seguros na ponta.
  return data || {};
},

async upsertTenantSettings(payload = {}) {
  // Sanitiza/normaliza apenas campos aceitos pela função:
  // brand_name, logo_url, subtitle, nav_layout, sidebar_width, header_density,
  // theme (json), nav_overrides (json)
  const clean = {};
  if (payload.brand_name !== undefined)   clean.brand_name = String(payload.brand_name || "").trim() || null;
  if (payload.logo_url !== undefined)     clean.logo_url = String(payload.logo_url || "").trim() || null;
  if (payload.subtitle !== undefined)     clean.subtitle = String(payload.subtitle || "").trim() || null;

  if (payload.nav_layout !== undefined) {
    // a função espera string; padrão no SQL é 'vertical'
    const v = String(payload.nav_layout || "").trim().toLowerCase();
    clean.nav_layout = v || null; // ex.: 'vertical' | 'horizontal'
  }

  if (payload.sidebar_width !== undefined) {
    const n = Number(payload.sidebar_width);
    clean.sidebar_width = Number.isFinite(n) ? Math.max(160, Math.min(400, Math.trunc(n))) : null;
  }

  if (payload.header_density !== undefined) {
    // no SQL padrão é 'regular' (poderia ser 'compact', etc)
    const d = String(payload.header_density || "").trim().toLowerCase();
    clean.header_density = d || null;
  }

  if (payload.theme !== undefined) {
    // deve ser JSON (obj)
    const t = payload.theme;
    clean.theme = (t && typeof t === "object") ? t : {};
  }

  if (payload.nav_overrides !== undefined) {
    // deve ser JSON (array)
    const n = payload.nav_overrides;
    clean.nav_overrides = Array.isArray(n) ? n : [];
  }

  const { error } = await supabase.rpc("upsert_tenant_settings", { payload: clean });
  if (error) throw new Error(`upsertTenantSettings: ${error.message}`);
  return true;
},
  // ==============================
  // FINANCEIRO — Mensalidades
  // ==============================
// ✅ Prévia (somente cálculo/mostra – nada grava)
async previewGenerateMonth({ ym, }) {
  if (!ym) throw new Error("previewGenerateMonth: 'ym' é obrigatório.");
 
  const [year, month] = ym.split("-").map(Number);

  // 1) Buscar alunos ativos do tenant
  const { data: students, error: e1 } = await supabase
    .from("students")
    .select("id, name, monthly_value, due_day, payer_id")
    .eq("status", "ativo")
   
  if (e1) throw new Error(`[previewGenerateMonth.students] ${e1.message}`);

  // 2) Montar lançamentos “virtuais” (sem gravar)
 return (students || [])
    .filter((s) => Number(s.monthly_value || 0) > 0) // só gera quem tem valor
    .map((s) => {
      // usar UTC para não “virar” a data por fuso
      const dueDate = new Date(Date.UTC(year, month - 1, Number(s.due_day || 5)))
        .toISOString()
        .slice(0, 10); // YYYY-MM-DD

      return {
        student_id: s.id,
        payer_id: s.payer_id || null,
        competence_month: `${ym}-01`,
        due_date: dueDate,
        amount: Number(s.monthly_value || 0),
        status: "pending",
        // snapshots úteis para a UI da prévia:
        student_name_snapshot: s.name,
        _needs_payer: !s.payer_id, // dica p/ interface (“será criado”)
      };
    });
},

// ✅ Geração efetiva (insere em 'payments')
async generateMonth({ ym, }) {
  if (!ym) throw new Error("generateMonth: 'ym' é obrigatório.");

  const monthStart = `${ym}-01`;

  // 1) Alunos ativos do tenant
  const { data: students, error: e1 } = await supabase
    .from("students")
    .select("id, name, monthly_value, due_day, payer_id, status")
    .eq("status", "ativo")
    
  if (e1) mapErr("generateMonth.students", e1);

  const candidates = (students || []).filter((s) => Number(s.monthly_value || 0) > 0);
  if (!candidates.length) return { inserted: 0, skipped_existing: 0, created_payers: 0 };

  // 2) Já existentes (não cancelados) para este mês
  const { data: existing, error: e2 } = await supabase
    .from("payments")
    .select("student_id")
    .eq("competence_month", monthStart)
    .neq("status", "canceled");
  if (e2) mapErr("generateMonth.existing", e2);
  const exists = new Set((existing || []).map((p) => p.student_id));
  const toProcess = candidates.filter((s) => !exists.has(s.id));
  if (!toProcess.length) {
    return { inserted: 0, skipped_existing: candidates.length, created_payers: 0 };
  }

  // 3) Payers do tenant (map para validar existência)
  const { data: payers, error: e3 } = await supabase
    .from("payers")
    .select("id, name");
  if (e3) mapErr("generateMonth.payers", e3);

const payerName = new Map((payers || []).map((p) => [p.id, p.name]));
const payerIds = new Set((payers || []).map((p) => p.id));
const payerByName = new Map(
  (payers || []).map((p) => [String(p.name || "").trim().toLowerCase(), p.id])
);

// 4) Preparar inserts (resolve pagador: próprio aluno ou terceiro)
const toInsert = [];
for (const s of students || []) {
  const amount = Number(s.monthly_value || 0);
  if (amount <= 0) continue;          // ignora mensalidade 0
  if (exists.has(s.id)) continue;     // já gerado para o mês

  let payer_id = s.payer_id || null;

  // ⚠️ garante pagador válido do MESMO tenant:
  //    1) se já tem payer_id e ele existe no tenant -> usa
  //    2) se não tem ou é inválido -> "aluno é o pagador"
  //       2.1) tenta achar por nome (case-insensitive) pra não duplicar
  //       2.2) se não achar, cria e vincula no aluno
  if (!payer_id || !payerIds.has(payer_id)) {
    const key = String(s.name || "").trim().toLowerCase();

    // tenta reaproveitar um pagador com mesmo nome
    let reuseId = key ? payerByName.get(key) : null;

    if (reuseId) {
      payer_id = reuseId;
    } else {
      // cria um pagador "self" com o nome do aluno
      const { data: createdPayer, error: ep } = await supabase
        .from("payers")
        .insert({ name: s.name })
        .select("id, name")
        .single();
      if (ep) mapErr("generateMonth.createPayer", ep);

      payer_id = createdPayer.id;
      payerIds.add(payer_id);
      payerName.set(payer_id, createdPayer.name);
      if (key) payerByName.set(key, payer_id);
    }

    // vincula o pagador resolvido no aluno
    const { error: es } = await supabase
      .from("students")
      .update({ payer_id })
      .eq("id", s.id)
      if (es) mapErr("generateMonth.linkPayerToStudent", es);
  }

  // due_date (UTC) a partir de ym + due_day
  const [Y, M] = ym.split("-").map(Number);
  const due_date = new Date(Date.UTC(Y, M - 1, Number(s.due_day || 5)))
    .toISOString()
    .slice(0, 10);

  const pyName = payerName.get(payer_id) || s.name;

  toInsert.push({
    // ❌ sem tenant_id — DEFAULT current_tenant_id() no banco
    student_id: s.id,
    payer_id, // ✅ garantido existente
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

  // 5) INSERT (sem onConflict). Se duplicar por corrida, tratamos 23505.
  try {
    const { data, error } = await supabase
      .from("payments")
      .insert(toInsert)
      .select("*");
    if (error) mapErr("generateMonth.insertPayments", error);
    return data || [];
  } catch (err) {
    if (err?.code === "23505") {
      const { data: rows, error: er } = await supabase
        .from("payments")
        .select("*")
        .eq("competence_month", monthStart)
        .neq("status", "canceled");
      if (er) mapErr("generateMonth.fetchAfterDup", er);
      return rows || [];
    }
    throw err;
  }
},

async listPayments({ ym, status = "all", page = 1, pageSize = 50 } = {}) {
  if (!ym) throw new Error("listPayments: 'ym' é obrigatório.");


  // Calcula intervalo do mês pelo due_date
  const monthStart = typeof monthStartOf === "function" ? monthStartOf(ym) : `${ym}-01`;
  const d = new Date(monthStart);
  d.setMonth(d.getMonth() + 1);
  const monthEnd = d.toISOString().slice(0, 10);

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  let q = supabase
    .from("payments")
    .select(
      "id, student_id, payer_id, competence_month, due_date, amount, status, paid_at, canceled_at, cancel_note, student_name_snapshot, payer_name_snapshot",
      { count: "exact" }
    )
    .gte("due_date", monthStart)
    .lt("due_date", monthEnd)
    .order("due_date", { ascending: true })
    .range(from, to);

  if (status && status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) mapErr("listPayments.query", error);

  // normaliza campos esperados pela UI
  const rows = (data || []).map((r) => ({
    id: r.id,
    student_id: r.student_id,
    payer_id: r.payer_id,
    competence_month: r.competence_month,
    due_date: r.due_date,
    amount: r.amount,
    status: r.status,
    paid_at: r.paid_at,
    canceled_at: r.canceled_at,
    cancel_note: r.cancel_note,
    student_name: r.student_name_snapshot,
    payer_name: r.payer_name_snapshot,
    // atraso (opcional)
    days_overdue:
      r.status === "pending"
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(`${r.due_date}T00:00:00Z`).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          )
        : 0,
  }));

  // KPIs customizados
  const today = new Date().toISOString().slice(0, 10);
  const kpis = {
    receita_a_receber: rows
      .filter(r => r.status === "pending")
      .reduce((acc, r) => acc + Number(r.amount || 0), 0),
    receita_atrasada: rows
      .filter(r => r.status === "pending" && r.due_date < today)
      .reduce((acc, r) => acc + Number(r.amount || 0), 0),
    receita_recebida: rows
      .filter(r => r.status === "paid")
      .reduce((acc, r) => acc + Number(r.amount || 0), 0),
  };

  return { rows, kpis };
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
  async listExpenseEntries({ ym, status = "all", cost_center = null } = {}) {
    const monthStart = monthStartOf(ym);

    let q = supabase
      .from("expense_entries")
      .select(
        "id, template_id, title_snapshot, category, amount, competence_month, due_date, status, paid_at, canceled_at, cancel_note, cost_center, created_at, updated_at"
      )
      .eq("competence_month", monthStart)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (cost_center && cost_center !== "all") {
      q = q.eq("cost_center", cost_center);
    }

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

// ✅ NOVO contrato canônico
async createExpenseEntry({
  due_date,        // "YYYY-MM-DD"
  amount,
  description,
  category = null,
  cost_center = "PJ",
}) {
  const d = String(due_date || "").slice(0, 10);
  if (!d) throw new Error("createExpenseEntry: 'due_date' é obrigatório (YYYY-MM-DD)");

  const desc = String(description || "").trim();
  if (!desc) throw new Error("createExpenseEntry: 'description' é obrigatório");

  const val = Number(amount || 0);
  if (!(val > 0)) throw new Error("createExpenseEntry: 'amount' deve ser > 0");

  const ym = d.slice(0, 7); // "YYYY-MM"
  const monthStart = `${ym}-01`;

  const row = {
    template_id: null,
    title_snapshot: desc,              // mapeia description -> title_snapshot
    category: category ?? null,
    amount: val,
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
    .select("id, template_id, title_snapshot, category, amount, competence_month, due_date, status, paid_at, canceled_at, cancel_note, cost_center, created_at, updated_at")
    .single();

  if (error) throw new Error(`createExpenseEntry: ${error.message}`);
  return data;
},

// ♻️ Alias para compatibilidade (chamadas antigas)
async createOneOffExpense({
  date,           // "YYYY-MM-DD"
  amount,
  title,
  category = null,
  cost_center = "PJ",
}) {
  // Redireciona para o contrato novo
  return this.createExpenseEntry({
    due_date: date,
    amount,
    description: title,
    category,
    cost_center,
  });
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

  const { data, error } = await supabase
    .from("expense_entries")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      cancel_note: note || null,
      paid_at: null,
    })
    .eq("id", id)
    .select("id, status, canceled_at, cancel_note, paid_at, updated_at") // selecione o que a UI precisa
    .single();

  if (error) throw new Error(`cancelExpense: ${error.message}`);
  return data; // ← linha atualizada
},
  async reopenExpense(id) {
  if (!id) throw new Error("reopenExpense: 'id' é obrigatório");

  const { data, error } = await supabase
    .from("expense_entries")
    .update({
      status: "pending",
      canceled_at: null,
      cancel_note: null,
    })
    .eq("id", id)
    .select("id, status, canceled_at, cancel_note, updated_at")
    .single();

  if (error) throw new Error(`reopenExpense: ${error.message}`);
  return data;
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
      // DB constraint allows only 'monthly' | 'annual'. Align comparison to 'annual'.
      if (String(t.frequency || "monthly") === "annual") {
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
      // DB constraint allows only 'monthly' | 'annual'. Align comparison to 'annual'.
      if (String(t.frequency || "monthly") === "annual") {
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
// ✅ Reabrir pagamento (volta para 'pending' e limpa campos de cancelamento/pagamento)
// Reabrir pagamento
 async reopenPayment(id) {
    if (!id) throw new Error("reopenPayment: 'id' é obrigatório.");

    // 1) Carrega o pagamento alvo
    const { data: row, error: e1 } = await supabase
      .from("payments")
      .select("id, tenant_id, student_id, competence_month")
      .eq("id", id)
      .single();
    if (e1) mapErr("reopenPayment.load", e1);
    if (!row) throw new Error("Pagamento não encontrado.");

    // 2) Confere se já existe outro ativo no mesmo mês
    const { data: conflicts, error: e2 } = await supabase
      .from("payments")
      .select("id, status")
      .eq("tenant_id", row.tenant_id)
      .eq("student_id", row.student_id)
      .eq("competence_month", row.competence_month)
      .neq("status", "canceled")
      .neq("id", row.id);
    if (e2) mapErr("reopenPayment.conflicts", e2);

    if (conflicts?.length) {
      const ym = String(row.competence_month).slice(0, 7); // YYYY-MM
      const [Y, M] = ym.split("-");
      throw new Error(
        `Já existe uma mensalidade ativa para este aluno em ${M}/${Y}. ` +
        `Cancele a outra antes de reabrir esta.`
      );
    }

    // 3) Atualiza para 'pending'
    const patch = {
      status: "pending",
      canceled_at: null,
      cancel_note: null,
      paid_at: null,
    };
    const { error: e3 } = await supabase.from("payments").update(patch).eq("id", id);
    if (e3) mapErr("reopenPayment.update", e3);

    return true;
  },

  async getMonthlyFinanceKpis({ ym, tenant_id, cost_center = null }) {
    const monthStart = monthStartOf(ym);
    const monthEnd = (() => {
      const d = new Date(`${ym}-01T00:00:00`);
      d.setMonth(d.getMonth() + 1);
      return d.toISOString().slice(0, 10); // YYYY-MM-DD (exclusivo)
    })();
    const today = tzToday("America/Sao_Paulo");

    let qPay = supabase
      .from("payments")
      .select("amount,status,due_date,paid_at")
      .gte("due_date", monthStart)
      .lt("due_date", monthEnd);
     const { data: payRows, error: e1 } = await qPay;
    if (e1) mapErr("getMonthlyFinanceKpis.payments", e1);

    const sum = (arr) => arr.reduce((a, b) => a + Number(b.amount || 0), 0);
    const rows = payRows || [];
    const revenue = {
      // ✅ PREVISTO = tudo que NÃO está cancelado (pending + paid)
      total_billed: sum(rows.filter(r => r.status !== "canceled")),
      // 💰 “recebidos” é perene: qualquer registro com paid_at definido
      paid: sum(rows.filter(r => r.paid_at != null)),
      // compat:
      pending: sum(rows.filter(r => r.status === "pending")),
      overdue: sum(rows.filter(r => r.status === "pending" && r.due_date < today)),
    };

    let q = supabase
      .from("expense_entries")
      .select("amount,status,due_date,cost_center")
      .gte("due_date", monthStart)
      .lt("due_date", monthEnd);
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

// --- Relatório: Inadimplência (Aging) ---
async reportReceivablesAging({ ym, tenant_id }) {
  if (!ym) throw new Error("reportReceivablesAging: 'ym' é obrigatório");
  const monthStart = monthStartOf(ym);
  const today = tzToday("America/Sao_Paulo"); // "YYYY-MM-DD"

  let q = supabase
    .from("payments")
    .select("id, tenant_id, student_id, payer_id, amount, due_date, status, competence_month, student_name_snapshot, payer_name_snapshot")
    .eq("competence_month", monthStart)
    .eq("status", "pending");

  if (tenant_id) q = q.eq("tenant_id", tenant_id);

  const { data, error } = await q;
  if (error) mapErr("reportReceivablesAging.select", error);

  // Só considera vencidos: due_date < hoje
  const rows = (data || [])
    .filter(r => r.due_date && r.due_date < today)
    .map(r => {
      const due = new Date(`${r.due_date}T00:00:00`);
      const ref = new Date(`${today}T00:00:00`);
      const days_overdue = Math.max(0, Math.floor((ref - due) / 86400000));
      return {
        ...r,
        days_overdue,
        payer_name: r.payer_name_snapshot ?? "—",
        student_name: r.student_name_snapshot ?? "—",
      };
    });

  // Buckets
  const bucketOf = (d) => {
    if (d <= 0) return null;
    if (d <= 15) return "1-15";
    if (d <= 30) return "16-30";
    if (d <= 60) return "31-60";
    return "61+";
  };

  const buckets = { "1-15": 0, "16-30": 0, "31-60": 0, "61+": 0 };
  let total = 0;

  for (const r of rows) {
    const b = bucketOf(r.days_overdue);
    if (!b) continue;
    buckets[b] += Number(r.amount || 0);
    total += Number(r.amount || 0);
  }

  // Por pagador
  const by_payer_map = new Map();
  for (const r of rows) {
    const b = bucketOf(r.days_overdue);
    if (!b) continue;
    const key = r.payer_id || `payer:${r.payer_name}`;
    if (!by_payer_map.has(key)) {
      by_payer_map.set(key, {
        payer_id: r.payer_id,
        payer_name: r.payer_name,
        total: 0,
        "1-15": 0, "16-30": 0, "31-60": 0, "61+": 0,
        items: []
      });
    }
    const agg = by_payer_map.get(key);
    agg[b] += Number(r.amount || 0);
    agg.total += Number(r.amount || 0);
    agg.items.push({
      id: r.id,
      student_id: r.student_id,
      student_name: r.student_name,
      due_date: r.due_date,
      amount: Number(r.amount || 0),
      days_overdue: r.days_overdue,
    });
  }
  const by_payer = [...by_payer_map.values()].sort((a,b) => b.total - a.total);

  return {
    as_of: today,
    ym,
    total,
    buckets,
    by_payer,
    rows, // detalhado (se quiser listar tudo)
  };
},

// --- KPIs combinados (Mensalidades + Outras Receitas) ---
async getCombinedRevenueKpis({ ym }) {
  // Busca as duas fontes em paralelo
  const [pays, others] = await Promise.all([
    this.listPayments({ ym, status: "all" }),
    this.listOtherRevenues({ ym, status: "all" }),
  ]);

  const rows = [
    ...(Array.isArray(pays?.rows) ? pays.rows : []),
    ...(Array.isArray(others?.rows) ? others.rows : []),
  ];

  const today = new Date().toISOString().slice(0, 10);
  const sum = (a) => a.reduce((acc, r) => acc + Number(r.amount || 0), 0);

  const received = sum(rows.filter(r => r.status === "paid"));
  const overdue  = sum(rows.filter(r => r.status === "pending" && String(r.due_date) < today));
  const upcoming = sum(rows.filter(r => r.status === "pending" && String(r.due_date) >= today));

  // total = apenas itens não cancelados
  const total = received + overdue + upcoming;

  return { total, received, upcoming, overdue };
},
  // ==============================
  // OUTRAS RECEITAS
  // ==============================
  async listOtherRevenues({ ym, status = "all", cost_center = null } = {}) {
    const monthStart = monthStartOf(ym);
    // (novo) Garante autogeração idempotente para o mês atual
  try {
    // A RPC do seu banco espera p_ym (TEXT), no formato "YYYY-MM"
    await supabase.rpc("ensure_other_revenues_for_month", {
      p_ym: monthStart.slice(0, 7), // ex.: "2025-11"
    });
  } catch (e) {
    console.warn(
      "[other_revenues] ensure_other_revenues_for_month falhou (seguindo com a listagem):",
      e?.message || e
    );
  }

    let q = supabase
      .from("other_revenues")
      .select(
        "id, title, category, amount, competence_month, due_date, status, paid_at, canceled_at, cancel_note, cost_center, created_at, updated_at"
      )
      .eq("competence_month", monthStart)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: true });

      if (cost_center && cost_center !== "all") {
    q = q.eq("cost_center", cost_center);
  }
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
    // previsto = tudo que NÃO está cancelado (paid + pending)
    total:   sum(rows.filter((x) => x.status !== "canceled")),
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
  ? normalizeDate(due_date)
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
  // --- Outras Receitas: UPDATE ---
async updateOtherRevenue(id, changes = {}, { syncCompetenceWithDueDate = false } = {}) {
  if (!id) throw new Error("updateOtherRevenue: 'id' é obrigatório");

  const patch = {};

  if (changes.title !== undefined) {
    const t = String(changes.title || "").trim();
    if (!t) throw new Error("updateOtherRevenue: 'title' não pode ficar vazio");
    patch.title = t;
  }

  if (changes.amount !== undefined) {
    const n = Number(changes.amount);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("updateOtherRevenue: 'amount' deve ser um número > 0");
    }
    patch.amount = n;
  }

  if (changes.due_date !== undefined) {
    const s = String(changes.due_date || "").slice(0, 10); // "YYYY-MM-DD"
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      throw new Error("updateOtherRevenue: 'due_date' deve ser YYYY-MM-DD");
    }
    patch.due_date = s;

    // (opcional) alinhar competência ao novo vencimento
    if (syncCompetenceWithDueDate) {
      const ym = s.slice(0, 7); // "YYYY-MM"
      patch.competence_month = `${ym}-01`;
    }
  }

  if (changes.category !== undefined) {
    patch.category = changes.category ? String(changes.category).trim() : null;
  }

  if (changes.cost_center !== undefined) {
    patch.cost_center = changes.cost_center ? String(changes.cost_center).trim() : "extra";
  }

  // NÃO permitimos alterar status por aqui (use mark/cancel/reopen)
  delete patch.status;
  delete patch.paid_at;
  delete patch.canceled_at;
  delete patch.cancel_note;

  if (Object.keys(patch).length === 0) {
    throw new Error("updateOtherRevenue: nada para atualizar");
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("other_revenues")
    .update(patch)
    .eq("id", id)
    .select("id, title, category, amount, competence_month, due_date, status, paid_at, canceled_at, cancel_note, cost_center, created_at, updated_at")
    .single();

  if (error) throw new Error(`updateOtherRevenue: ${error.message}`);
  return data;
},

  // ==============================
  // PROFESSORES — Payout por mês
  // ==============================
  async sumTeacherPayoutByMonth(teacherId, ym) {
  if (!teacherId || !ym) throw new Error("sumTeacherPayoutByMonth: 'teacherId' e 'ym' são obrigatórios");
  const monthStart = `${ym}-01`;
  const [Y, M] = ym.split("-").map(Number);
  const nextMonthStart = `${M === 12 ? Y + 1 : Y}-${String(M === 12 ? 1 : M + 1).padStart(2, "0")}-01`;

  // pega rate do professor
  const { data: teacher, error: eT } = await supabase
    .from("teachers")
    .select("id, hourly_rate, rate_mode, rate_rules, pay_day, status")
    .eq("id", teacherId)
    .single();
  if (eT) mapErr("sumTeacherPayoutByMonth.teacher", eT);
  if (!teacher) return { hours: 0, sessions: 0, amount: 0, hourly_rate: 0, pay_day: 5 };

  const rateMode = teacher.rate_mode === "by_size" ? "by_size" : "flat";
  const baseHourly = Number(teacher.hourly_rate || 0);
  const rules = Array.isArray(teacher.rate_rules) ? teacher.rate_rules : [];

  // ⚠️ usa snapshots da sessão e o campo correto: duration_hours
  const { data: sess, error: eS } = await supabase
    .from("sessions")
    .select("id,date,duration_hours,headcount_snapshot,teacher_id_snapshot,turmas!inner(id,teacher_id)")
    .gte("date", monthStart)
    .lt("date", nextMonthStart)
    .eq("teacher_id_snapshot", teacherId);
  if (eS) mapErr("sumTeacherPayoutByMonth.sessions", eS);

  let totalHours = 0, totalAmount = 0, count = 0;

  const hourlyBySize = (headcount) => {
    if (!rules.length) return baseHourly;
    const n = Number(headcount || 0) > 0 ? Number(headcount) : 1;
    let match = rules.find(r =>
      (r.min == null || n >= Number(r.min)) &&
      (r.max == null || n <= Number(r.max))
    );
    if (!match) match = [...rules].sort((a,b)=>Number(a.min||0)-Number(b.min||0))[0];
    return Number(match?.hourly_rate || baseHourly || 0);
  };

  for (const s of (sess || [])) {
    const h = Number(s.duration_hours || 0); // <-- CORRETO
    if (h <= 0) continue;
    count += 1;
    totalHours += h;

  const hc = Number(s.headcount_snapshot || 0);
  const hr = rateMode === "by_size" ? hourlyBySize(hc) : baseHourly;
  totalAmount += h * hr;
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
 // KPIs para a Home (tenant-aware, sem dupla contagem, mantém soma de professores)
// ==============================
// FINANCEIRO — Resumo do mês (com custo de professores vindo das sessões)
// ==============================
// ==============================
// FINANCEIRO — Resumo do mês (inclui Professores nas despesas)
// ==============================
// ✅ Resumo mensal — escopo de tenant via RLS/JWT (sem tenant_id)
async getMonthlyFinancialSummary({ ym, cost_center = null } = {}) {
  // 1) KPIs base (receita + despesas de entries)
  const base = await this.getMonthlyFinanceKpis({ ym, cost_center: null }); // RLS aplica tenant
  const receita   = Number(base?.revenue?.total_billed || 0);  // competência (faturado)
  const pagosRec  = Number(base?.revenue?.paid || 0);          // recebidos (caixa)
  const despTotal = Number(base?.expense?.total || 0);         // SOMENTE expense_entries
  const despPagas = Number(base?.expense?.paid || 0);          // pagas (caixa)
  const by_cost_center = Array.isArray(base?.by_cost_center) ? base.by_cost_center : [];

  // 2) Professores (escopo via RLS)
  const teachers = await this.listTeachers(); // sem tenant_id
  const payouts = await Promise.all(
    (teachers || []).map((t) => this.sumTeacherPayoutByMonth(t.id, ym)) // sem tenant_id
  );
  const professores = payouts.reduce((acc, p) => acc + Number(p?.amount || 0), 0);

  // 3) Despesas (todas) = entries (recorrentes + avulsas) + professores
  const despesas = despTotal + professores;

  // 4) Despesas PJ / PF
  const toKey = (s) => String(s || "").trim().toLowerCase();
  const totalPJ = by_cost_center
    .filter((cc) => toKey(cc.cost_center) === "pj")
    .reduce((a, cc) => a + Number(cc.total || 0), 0);
  const totalPF = by_cost_center
    .filter((cc) => toKey(cc.cost_center) === "pf")
    .reduce((a, cc) => a + Number(cc.total || 0), 0);

  const despesas_pj = totalPJ + professores; // PJ inclui professores
  const despesas_pf = totalPF;               // PF não inclui professores

  // 5) Saldos
  const saldo = pagosRec - despPagas;                 // caixa
  const saldo_operacional = receita - despesas;       // competência

  return {
    receita,
    despesas,
    professores,
    saldo,
    saldo_operacional,
    despesas_pj,
    despesas_pf,
    by_cost_center,
  };
}


  };

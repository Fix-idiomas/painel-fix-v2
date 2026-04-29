import { supabase } from "../supabaseClient";
import { mapErr, normalizeRules, toIsoTz, tzToday, addDaysISO } from "./helpers";
import type { Turma } from "@/types";

export const turmaGateway = {
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

  async countStudentsInTurma(turmaId: string) {
    const { count, error } = await supabase
      .from("turma_members")
      .select("*", { count: "exact", head: true })
      .eq("turma_id", turmaId);
    if (error) mapErr("countStudentsInTurma", error);
    return count || 0;
  },

  async listTurmaMembers(turmaId: string) {
    if (!turmaId) throw new Error("listTurmaMembers: 'turmaId' é obrigatório");

    const { data: links, error: e1 } = await supabase
      .from("turma_members")
      .select("student_id")
      .eq("turma_id", turmaId);

    if (e1) throw new Error(`listTurmaMembers.links: ${e1.message}`);

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

  createTurma: async function (payload: Record<string, unknown> = {}) {
    const name = String(payload.name || "").trim();
    if (!name) throw new Error("createTurma: 'name' é obrigatório");

    const capacity = Math.max(1, Number(payload.capacity || 20));
    const teacher_id = payload.teacher_id || null;
    if (!teacher_id) throw new Error("createTurma: 'teacher_id' é obrigatório");

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

  updateTurma: async function (id: string, changes: Record<string, unknown> = {}) {
    if (!id) throw new Error("updateTurma: 'id' é obrigatório");

    const patch: Record<string, unknown> = {};
    if (changes.name !== undefined) {
      const name = String(changes.name || "").trim();
      if (!name) throw new Error("updateTurma: 'name' não pode ser vazio");
      patch.name = name;
    }
    if (changes.teacher_id !== undefined) {
      if (!changes.teacher_id) throw new Error("updateTurma: 'teacher_id' não pode ser vazio");
      patch.teacher_id = changes.teacher_id;
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

    const delMembers = await supabase.from("turma_members").delete().eq("turma_id", id);
    if (delMembers.error) throw new Error(`deleteTurma (members): ${delMembers.error.message}`);

    const delSessions = await supabase.from("sessions").delete().eq("turma_id", id);
    if (delSessions.error) throw new Error(`deleteTurma (sessions): ${delSessions.error.message}`);

    const { error: eTurma } = await supabase.from("turmas").delete().eq("id", id);
    if (eTurma) throw new Error(`deleteTurma: ${eTurma.message}`);

    return true;
  },

  async addStudentToTurma(turmaId: string, studentId: string) {
    if (!turmaId || !studentId) throw new Error("addStudentToTurma: turmaId e studentId são obrigatórios");
    const { data, error } = await supabase
      .from("turma_members")
      .upsert(
        { turma_id: turmaId, student_id: studentId, status: "ativo" },
        { onConflict: "turma_id,student_id" }
      )
      .select("turma_id, student_id, status, created_at, updated_at")
      .single();
    if (error) mapErr("addStudentToTurma", error);
    return data;
  },

  async removeStudentFromTurma(turmaId: string, studentId: string) {
    if (!turmaId || !studentId) throw new Error("removeStudentFromTurma: turmaId e studentId são obrigatórios");
    const { error } = await supabase
      .from("turma_members")
      .delete()
      .eq("turma_id", turmaId)
      .eq("student_id", studentId);
    if (error) mapErr("removeStudentFromTurma", error);
    return true;
  },

  // --- Sessões & Presenças ---
  async listSessions(turmaId: string) {
    if (!turmaId) throw new Error("listSessions: 'turmaId' é obrigatório");

    const { data, error } = await supabase
      .from("sessions")
      .select("id, turma_id, date, duration_hours, notes, headcount_snapshot, created_at, updated_at")
      .eq("turma_id", turmaId)
      .order("date", { ascending: true });

    if (error) throw new Error(`listSessions: ${error.message}`);
    const toIso = (d) => (d ? new Date(d).toISOString() : null);
    return (data || []).map(s => ({
      ...s,
      date: toIso(s.date),
    }));
  },

  async getSession(id: string) {
    if (!id) throw new Error("getSession: 'id' é obrigatório");
    const { data, error } = await supabase
      .from("sessions")
      .select("id, turma_id, date, duration_hours, notes")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`getSession: ${error.message}`);
    if (!data) return null;
    return {
      ...data,
      date: data.date ? new Date(data.date).toISOString() : null,
      duration_hours: Number(data.duration_hours || 0),
    };
  },

  async listSessionsInRange({ start, end }: { start: string; end: string }) {
    const s = String(start || "");
    const e = String(end || "");
    if (!s || !e) throw new Error("listSessionsInRange: 'start' e 'end' são obrigatórios");
    const { data, error } = await supabase
      .from("sessions")
      .select("id, turma_id, date, duration_hours, notes")
      .gte("date", s)
      .lt("date", e)
      .order("date", { ascending: true });
    if (error) throw new Error(`listSessionsInRange: ${error.message}`);
    const toIso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);
    return (data || []).map((row) => ({
      ...row,
      date: toIso(row.date),
      duration_hours: Number(row.duration_hours || 0),
    }));
  },

  async listSessionsWithAttendance({ turmaId, start, end }: { turmaId: string; start?: string; end?: string }) {
    if (!turmaId) throw new Error("listSessionsWithAttendance: 'turmaId' é obrigatório");

    const s = String(start || "").slice(0, 10);
    const e = String(end   || "").slice(0, 10);
    if (!s || !e) throw new Error("listSessionsWithAttendance: 'start' e 'end' são obrigatórios (YYYY-MM-DD)");

    const startISO = `${s}T00:00:00Z`;
    const endISO   = `${e}T23:59:59Z`;

    const { data: sessRows, error: eS } = await supabase
      .from("sessions")
      .select("id, turma_id, date, duration_hours, notes")
      .gte("date", startISO)
      .lte("date", endISO)
      .order("date", { ascending: true });
    if (eS) throw new Error(eS.message);
    if (!sessRows || sessRows.length === 0) return [];

    const ids = sessRows.map(x => x.id);
    const { data: att, error: eA } = await supabase
      .from("attendance")
      .select("session_id")
      .in("session_id", ids);
    if (eA) throw new Error(eA.message);

    const has = new Set((att || []).map(a => a.session_id));

    const toIso = (d) => (d ? new Date(d).toISOString() : null);

    return sessRows.map(row => ({
      id: row.id,
      turma_id: row.turma_id,
      date: toIso(row.date),
      duration_hours: Number(row.duration_hours || 0),
      notes: row.notes || "",
      has_attendance: has.has(row.id),
    }));
  },

  async createSession(payload: Record<string, unknown>) {
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
      .insert([row])
      .select("id,turma_id,date,duration_hours,notes,headcount_snapshot")
      .single();
    if (error) mapErr("createSession", error);
    return data;
  },

  async updateSession(id: string, changes: Record<string, unknown>) {
    if (!id || (typeof id !== "string" && typeof id !== "number")) {
      throw new Error("ID da sessão é obrigatório.");
    }

    const patch: Record<string, unknown> = {};
    if (changes?.date != null) {
      patch.date = toIsoTz(String(changes.date).slice(0, 25));
    }
    if (changes?.notes != null)            patch.notes = changes.notes || "";
    if (changes?.duration_hours !== undefined)
      patch.duration_hours = Number(changes.duration_hours ?? 0.5);
    if (changes?.headcount_snapshot !== undefined)
      patch.headcount_snapshot =
        changes.headcount_snapshot != null ? Number(changes.headcount_snapshot) : null;

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
      .select("id,turma_id,date,duration_hours,notes,headcount_snapshot");

    if (error) mapErr("updateSession", error);

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      throw new Error("Sessão não encontrada ou sem permissão para editar.");
    }
    return row;
  },

  async createOneOffSession({
    turma_id,
    date,
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

  async deleteSession(id: string) {
    if (!id) throw new Error("ID da sessão é obrigatório.");
    const { error } = await supabase.from("sessions").delete().eq("id", id);
    if (error) mapErr("deleteSession", error);
    return true;
  },

  async listAttendance(sessionId: string) {
    const { data, error } = await supabase
      .from("attendance")
      .select("student_id, present, note")
      .eq("session_id", sessionId);

    if (error) mapErr("listAttendance", error);
    return data || [];
  },

  async deleteAttendance(sessionId: string, studentId: string) {
    const { error } = await supabase
      .from("attendance")
      .delete()
      .eq("session_id", sessionId)
      .eq("student_id", studentId);

    if (error) mapErr("deleteAttendance", error);
    return true;
  },

  async upsertAttendance(sessionId: string, studentId: string, { present, note }: { present: boolean; note?: string | null }) {
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

  async ensureSessionsFromRules({ turmaId, startDate, endDate }: { turmaId: string; startDate?: string; endDate?: string }) {
    if (!turmaId) throw new Error("ensureSessionsFromRules: 'turmaId' é obrigatório");
    const start = new Date(String(startDate).slice(0, 10));
    const end   = new Date(String(endDate).slice(0, 10));
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      throw new Error("ensureSessionsFromRules: intervalo inválido");
    }

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

    const rows = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const wd = d.getUTCDay();
      const r  = ruleByWeekday.get(wd);
      if (!r) continue;

      const yyyy = d.getUTCFullYear();
      const mm   = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd   = String(d.getUTCDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;

      rows.push({
        turma_id: turmaId,
        date: toIsoTz(dateStr),
        duration_hours: Number(r.duration_hours ?? 0.5),
        notes: null,
        headcount_snapshot: null,
      });
    }
    if (rows.length === 0) return 0;

    const { error: eU } = await supabase
      .from("sessions")
      .upsert(rows, { onConflict: "turma_id,date", ignoreDuplicates: false });
    if (eU) mapErr("ensureSessionsFromRules.upsert", eU);

    return rows.length;
  },

  async pruneSessionsNotInRules({ turmaId, startDate, endDate }: { turmaId: string; startDate?: string; endDate?: string }) {
    if (!turmaId) throw new Error("pruneSessionsNotInRules: 'turmaId' é obrigatório");
    const s = String(startDate).slice(0, 10);
    const e = String(endDate).slice(0, 10);

    const { data: turma, error: eT } = await supabase
      .from("turmas")
      .select("id, meeting_rules")
      .eq("id", turmaId)
      .single();
    if (eT) mapErr("pruneSessionsNotInRules.turma", eT);
    const rules = normalizeRules(turma?.meeting_rules);
    const validWeekdays = new Set(rules.filter(r => r.weekday !== null).map(r => r.weekday));

    const { data: sessions, error: eS } = await supabase
      .from("sessions")
      .select("id, turma_id, date")
      .eq("turma_id", turmaId)
      .gte("date", s)
      .lte("date", e);
    if (eS) mapErr("pruneSessionsNotInRules.sessions", eS);
    if (!sessions || sessions.length === 0) return 0;

    const ids = sessions.map((x) => x.id);
    const { data: att, error: eA } = await supabase
      .from("attendance")
      .select("session_id")
      .in("session_id", ids);
    if (eA) mapErr("pruneSessionsNotInRules.attendance", eA);
    const protectedIds = new Set((att || []).map((a) => a.session_id));

    const toDelete = [];
    for (const sRow of sessions) {
      const d = new Date(sRow.date);
      if (isNaN(d.getTime())) continue;
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

  async generateSessionsForTurma(turma: Turma, { horizonDays = 90 }: { horizonDays?: number } = {}) {
    const turmaId = typeof turma === "string" ? turma : turma?.id;
    if (!turmaId) throw new Error("generateSessionsForTurma: turmaId inválido");

    const start = tzToday("America/Sao_Paulo");
    const end   = addDaysISO(start, horizonDays);

    const generated = await this.ensureSessionsFromRules({ turmaId, startDate: start, endDate: end });

    let pruned = 0;
    try {
      pruned = await this.pruneSessionsNotInRules({ turmaId, startDate: start, endDate: end });
    } catch (e) {
      console.warn("[turmas] pruneSessions* falhou:", e?.message || e);
    }

    return { generated, pruned, start, end };
  },
};

import { supabase } from "../supabaseClient";
import { mapErr, monthStartOf } from "./helpers";
import type {
  Teacher,
  CreateTeacherPayload,
  UpdateTeacherPayload,
  TeacherPayout,
  TeacherSessionRow,
  RateRule,
} from "@/types";

export const teacherGateway = {
  async listTeachers(): Promise<Teacher[]> {
    const { data, error } = await supabase
      .from("teachers")
      .select("id,name,email, phone, user_id, status, hourly_rate, pay_day, rate_mode, rate_rules")
      .order("name", { ascending: true });
    if (error) mapErr("listTeachers", error);
    return (data || []) as Teacher[];
  },

  async createTeacher(payload: CreateTeacherPayload = {} as CreateTeacherPayload): Promise<Teacher> {
    const row = {
      name: String(payload.name || "").trim(),
      email: payload.email ? String(payload.email).trim() : null,
      phone: payload.phone ? String(payload.phone).trim() : null,
      status: payload.status === "inativo" ? "inativo" : "ativo",
      hourly_rate: Number(payload.hourly_rate || 0),
      pay_day: (() => {
        const d = Number(payload.pay_day || 5);
        if (!Number.isInteger(d) || d < 1 || d > 28)
          throw new Error("createTeacher: 'pay_day' deve ser 1..28");
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
    return data as Teacher;
  },

  async updateTeacher(id: string, changes: UpdateTeacherPayload = {}): Promise<Teacher | null> {
    if (!id) throw new Error("updateTeacher: 'id' é obrigatório");

    const patch: Record<string, unknown> = {};
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
      const toNum = (v: unknown): number | null => {
        const n = Number(String(v ?? "").trim());
        return Number.isFinite(n) ? n : null;
      };
      const arr: Array<Record<string, unknown>> = Array.isArray(changes.rate_rules) ? (changes.rate_rules as unknown[]).map((r) => r as Record<string, unknown>) : [];
      const normalized: RateRule[] = arr
        .map((r) => ({
          min: toNum(r.min),
          max: toNum(r.max),
          hourly_rate: toNum(r.rate ?? r.hourly_rate) ?? 0,
        }))
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
    return data as Teacher | null;
  },

  async setTeacherStatus(id: string, status: "ativo" | "inativo"): Promise<Teacher | null> {
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
    return data as Teacher | null;
  },

  async deleteTeacher(id: string): Promise<true> {
    if (!id) throw new Error("ID do professor é obrigatório.");
    const { error } = await supabase.from("teachers").delete().eq("id", id);
    if (error) mapErr("deleteTeacher", error);
    return true;
  },

  async sumTeacherPayoutByMonth(teacherId: string, ym: string): Promise<TeacherPayout> {
    if (!teacherId || !ym)
      throw new Error("sumTeacherPayoutByMonth: 'teacherId' e 'ym' são obrigatórios");
    const monthStart = `${ym}-01`;
    const [Y, M] = ym.split("-").map(Number);
    const nextMonthStart = `${M === 12 ? Y + 1 : Y}-${String(M === 12 ? 1 : M + 1).padStart(2, "0")}-01`;

    const { data: teacher, error: eT } = await supabase
      .from("teachers")
      .select("id, hourly_rate, rate_mode, rate_rules, pay_day, status")
      .eq("id", teacherId)
      .single();
    if (eT) mapErr("sumTeacherPayoutByMonth.teacher", eT);
    if (!teacher) return { hours: 0, sessions: 0, amount: 0, hourly_rate: 0, pay_day: 5 };

    const rateMode = teacher.rate_mode === "by_size" ? "by_size" : "flat";
    const baseHourly = Number(teacher.hourly_rate || 0);
    const rules: RateRule[] = Array.isArray(teacher.rate_rules) ? teacher.rate_rules : [];

    const { data: sess, error: eS } = await supabase
      .from("sessions")
      .select("id,date,duration_hours,headcount_snapshot,teacher_id_snapshot,turmas!inner(id,teacher_id)")
      .gte("date", monthStart)
      .lt("date", nextMonthStart)
      .eq("teacher_id_snapshot", teacherId);
    if (eS) mapErr("sumTeacherPayoutByMonth.sessions", eS);

    let totalHours = 0, totalAmount = 0, count = 0;

    const hourlyBySize = (headcount: unknown): number => {
      if (!rules.length) return baseHourly;
      const n = Number(headcount || 0) > 0 ? Number(headcount) : 1;
      let match = rules.find(
        (r) =>
          (r.min == null || n >= Number(r.min)) &&
          (r.max == null || n <= Number(r.max))
      );
      if (!match) match = [...rules].sort((a, b) => Number(a.min || 0) - Number(b.min || 0))[0];
      return Number(match?.hourly_rate || baseHourly || 0);
    };

    for (const s of (sess || []) as Array<Record<string, unknown>>) {
      const h = Number(s.duration_hours || 0);
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

  async listTeacherSessionsByMonth(teacherId: string, ym: string): Promise<TeacherSessionRow[]> {
    if (!teacherId) throw new Error("listTeacherSessionsByMonth: 'teacherId' é obrigatório");
    const mStart = monthStartOf(ym);
    const [Y, M] = mStart.slice(0, 7).split("-").map(Number);
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
    const rules: RateRule[] = Array.isArray(teacher.rate_rules) ? teacher.rate_rules : [];

    const { data: sess, error: eS } = await supabase
      .from("sessions")
      .select("id,date,duration_hours,headcount_snapshot,turma_id,turmas!inner(id,name,teacher_id)")
      .gte("date", mStart)
      .lt("date", nextMonthStart)
      .eq("turmas.teacher_id", teacherId)
      .order("date", { ascending: true });
    if (eS) mapErr("listTeacherSessionsByMonth.sessions", eS);

    function hourlyBySize(headcount: unknown): number {
      if (!rules.length) return baseHourly;
      const n = Number(headcount || 0) > 0 ? Number(headcount) : 1;
      let match = rules.find(
        (r) =>
          r &&
          (r.min == null || n >= Number(r.min)) &&
          (r.max == null || n <= Number(r.max))
      );
      if (!match) {
        const sorted = [...rules].sort((a, b) => Number(a.min || 0) - Number(b.min || 0));
        match = sorted[0];
      }
      return Number(match?.hourly_rate || baseHourly || 0);
    }

    const toIso = (d: unknown): string | null =>
      d ? new Date(d as string).toISOString() : null;

    return ((sess || []) as Array<Record<string, unknown>>).map((s) => {
      const h = Number(s.duration_hours || 0);
      const hourly = rateMode === "by_size" ? hourlyBySize(s.headcount_snapshot) : baseHourly;
      const amount = h * Number(hourly || 0);
      const turmas = s.turmas as Record<string, unknown> | null;
      return {
        id: s.id as string,
        date: toIso(s.date),
        turma_id: s.turma_id as string,
        turma_name: (turmas?.name as string) || "",
        duration_hours: h,
        headcount_snapshot: s.headcount_snapshot != null ? Number(s.headcount_snapshot) : null,
        hourly_applied: Number(hourly || 0),
        amount: Number(amount || 0),
      };
    });
  },
};

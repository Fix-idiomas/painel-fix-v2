import { supabase } from "../supabaseClient";
import { mapErr, clampDay1to28, getTenantId } from "./helpers";
import type {
  Student,
  CreateStudentPayload,
  UpdateStudentPayload,
  AttendanceRecord,
} from "@/types";

export const studentGateway = {
  async listStudents(): Promise<Student[]> {
    const sel = "id,name,status,monthly_value,due_day,birth_date,payer_id,email,endereco,cpf,photo_url";
    const { data, error } = await supabase
      .from("students")
      .select(sel)
      .order("name", { ascending: true });
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("photo_url") && msg.includes("does not exist")) {
        const { data: dataFallback, error: errorFallback } = await supabase
          .from("students")
          .select("id,name,status,monthly_value,due_day,birth_date,payer_id,email,endereco,cpf")
          .order("name", { ascending: true });
        if (errorFallback) mapErr("listStudents(fallback)", errorFallback);
        return ((dataFallback || []) as Student[]).map((r) => ({ ...r, photo_url: null }));
      }
      mapErr("listStudents", error);
    }
    return (data || []) as Student[];
  },

  async createStudent(payload: CreateStudentPayload): Promise<Student> {
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
    const tenant_id = await getTenantId();

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
      tenant_id,
    };
    const { data, error } = await supabase
      .from("students")
      .insert(row)
      .select("id,name,tenant_id,status,monthly_value,due_day,birth_date,payer_id,email,endereco,cpf")
      .single();
    if (error) mapErr("createStudent", error);
    return data as Student;
  },

  async updateStudent(id: string, changes: UpdateStudentPayload = {}): Promise<Student> {
    if (!id) throw new Error("updateStudent: 'id' é obrigatório");

    const patch: Record<string, unknown> = {};

    if (changes.name !== undefined) {
      const nm = String(changes.name || "").trim();
      if (!nm) throw new Error("updateStudent: 'name' é obrigatório");
      patch.name = nm;
    }

    if (changes.monthly_value !== undefined) {
      patch.monthly_value = Number(changes.monthly_value || 0);
    }

    if (changes.due_day !== undefined) {
      const d = Number(changes.due_day);
      if (!Number.isInteger(d) || d < 1 || d > 28) {
        throw new Error("updateStudent: 'due_day' deve ser inteiro entre 1 e 28");
      }
      patch.due_day = d;
    }

    if (changes.birth_date !== undefined) {
      patch.birth_date = changes.birth_date ? String(changes.birth_date).slice(0, 10) : null;
    }

    if (changes.payer_id !== undefined) {
      patch.payer_id = changes.payer_id || null;
    }

    if (changes.email !== undefined) {
      const em = String(changes.email || "").trim();
      patch.email = em ? em.toLowerCase() : null;
    }

    if (changes.endereco !== undefined) {
      const en = String(changes.endereco || "").trim();
      patch.endereco = en || null;
    }

    if (changes.cpf !== undefined) {
      const cpf = String(changes.cpf || "").trim();
      patch.cpf = cpf || null;
    }

    if (changes.photo_url !== undefined) {
      const p = String(changes.photo_url || "").trim();
      patch.photo_url = p || null;
    }

    if (Object.keys(patch).length === 0) {
      throw new Error("updateStudent: nada para atualizar");
    }

    const { data, error } = await supabase
      .from("students")
      .update(patch)
      .eq("id", id)
      .select("id, name, status, monthly_value, due_day, birth_date, payer_id, email, endereco, cpf, photo_url, updated_at")
      .single();

    if (error) {
      const msg = String(error.message || "");
      if (msg.toLowerCase().includes("foreign key")) {
        throw new Error("Pagador inválido: verifique o pagador selecionado.");
      }
      throw new Error(`updateStudent: ${msg}`);
    }
    return data as Student;
  },

  async setStudentStatus(id: string, status: "ativo" | "inativo"): Promise<Student> {
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
    return data as Student;
  },

  async deleteStudent(id: string): Promise<true> {
    if (!id) throw new Error("ID é obrigatório");
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) mapErr("deleteStudent", error);
    return true;
  },

  async listAttendanceByStudent(studentId: string): Promise<AttendanceRecord[]> {
    if (!studentId) throw new Error("listAttendanceByStudent: 'studentId' é obrigatório");

    const { data: atts, error: e1 } = await supabase
      .from("attendance")
      .select("session_id, student_id, present, note, created_at, updated_at, tenant_id")
      .eq("student_id", studentId);
    if (e1) throw new Error(e1.message);

    const sessionIds = [...new Set((atts || []).map((a) => a.session_id))];
    if (sessionIds.length === 0) return [];

    const { data: sessions, error: e2 } = await supabase
      .from("sessions")
      .select("id, date, turma_id")
      .in("id", sessionIds);
    if (e2) throw new Error(e2.message);
    const mapSession = new Map((sessions || []).map((s) => [s.id, s]));

    const turmaIds = [...new Set((sessions || []).map((s) => s.turma_id).filter(Boolean))];
    let mapTurma = new Map<string, { id: string; name: string }>();
    if (turmaIds.length) {
      const { data: turmas, error: e3 } = await supabase
        .from("turmas")
        .select("id, name")
        .in("id", turmaIds);
      if (e3) throw new Error(e3.message);
      mapTurma = new Map((turmas || []).map((t) => [t.id, t]));
    }

    const toIso = (v: unknown): string | null => {
      if (!v) return null;
      const s = String(v).trim();
      const onlyDate = /^\d{4}-\d{2}-\d{2}$/.test(s);
      const safe = onlyDate ? `${s}T00:00:00` : s.slice(0, 25);
      const d = new Date(safe);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    };

    const out: AttendanceRecord[] = (atts || []).map((a) => {
      const s = mapSession.get(a.session_id);
      const turmaName = s ? (mapTurma.get(s.turma_id)?.name ?? null) : null;
      return {
        key: `${a.session_id}:${a.student_id}`,
        session_id: a.session_id,
        student_id: a.student_id,
        present: !!a.present,
        note: a.note,
        created_at: a.created_at,
        updated_at: a.updated_at,
        tenant_id: a.tenant_id,
        session_date_snapshot: toIso(s?.date),
        turma_name_snapshot: turmaName,
      };
    });

    out.sort((a, b) =>
      String(a.session_date_snapshot || a.created_at || "").localeCompare(
        String(b.session_date_snapshot || b.created_at || "")
      )
    );

    return out;
  },
};

import { supabase } from "../supabaseClient";
import { mapErr, monthStartOf } from "./helpers";
import type { PaymentStatus } from "@/types";

interface PaymentRow {
  id: string;
  student_id: string | null;
  payer_id: string | null;
  competence_month: string;
  due_date: string;
  amount: number;
  status: PaymentStatus;
  paid_at: string | null;
  canceled_at: string | null;
  cancel_note: string | null;
  student_name: string | null;
  payer_name: string | null;
  days_overdue: number;
}

interface PaymentKpis {
  receita_a_receber: number;
  receita_atrasada: number;
  receita_recebida: number;
}

interface PaymentPreview {
  student_id: string;
  payer_id: string | null;
  competence_month: string;
  due_date: string;
  amount: number;
  status: "pending";
  student_name_snapshot: string;
  _needs_payer: boolean;
}

export const paymentGateway = {
  async previewGenerateMonth({ ym }: { ym: string }): Promise<PaymentPreview[]> {
    if (!ym) throw new Error("previewGenerateMonth: 'ym' é obrigatório.");

    const [year, month] = ym.split("-").map(Number);

    const { data: students, error: e1 } = await supabase
      .from("students")
      .select("id, name, monthly_value, due_day, payer_id")
      .eq("status", "ativo");

    if (e1) throw new Error(`[previewGenerateMonth.students] ${e1.message}`);

    return (students || [])
      .filter((s) => Number(s.monthly_value || 0) > 0)
      .map((s) => {
        const dueDate = new Date(Date.UTC(year, month - 1, Number(s.due_day || 5)))
          .toISOString()
          .slice(0, 10);

        return {
          student_id: s.id,
          payer_id: s.payer_id || null,
          competence_month: `${ym}-01`,
          due_date: dueDate,
          amount: Number(s.monthly_value || 0),
          status: "pending" as const,
          student_name_snapshot: s.name,
          _needs_payer: !s.payer_id,
        };
      });
  },

  async generateMonth({ ym }: { ym: string }): Promise<unknown[] | { inserted: number; skipped_existing: number; created_payers: number }> {
    if (!ym) throw new Error("generateMonth: 'ym' é obrigatório.");

    const monthStart = `${ym}-01`;

    const { data: students, error: e1 } = await supabase
      .from("students")
      .select("id, name, monthly_value, due_day, payer_id, status")
      .eq("status", "ativo");

    if (e1) mapErr("generateMonth.students", e1);

    const candidates = (students || []).filter((s) => Number(s.monthly_value || 0) > 0);
    if (!candidates.length) return { inserted: 0, skipped_existing: 0, created_payers: 0 };

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

    const { data: payers, error: e3 } = await supabase.from("payers").select("id, name");
    if (e3) mapErr("generateMonth.payers", e3);

    const payerName = new Map((payers || []).map((p) => [p.id, p.name]));
    const payerIds = new Set((payers || []).map((p) => p.id));
    const payerByName = new Map(
      (payers || []).map((p) => [String(p.name || "").trim().toLowerCase(), p.id])
    );

    const toInsert: Record<string, unknown>[] = [];
    for (const s of students || []) {
      const amount = Number(s.monthly_value || 0);
      if (amount <= 0) continue;
      if (exists.has(s.id)) continue;

      let payer_id: string | null = s.payer_id || null;

      if (!payer_id || !payerIds.has(payer_id)) {
        const key = String(s.name || "").trim().toLowerCase();
        const reuseId = key ? payerByName.get(key) : null;

        if (reuseId) {
          payer_id = reuseId;
        } else {
          const { data: createdPayer, error: ep } = await supabase
            .from("payers")
            .insert({ name: s.name })
            .select("id, name")
            .single();
          if (ep) mapErr("generateMonth.createPayer", ep);

          payer_id = createdPayer.id;
          payerIds.add(payer_id as string);
          payerName.set(payer_id as string, createdPayer.name);
          if (key) payerByName.set(key, payer_id as string);
        }

        const { error: es } = await supabase
          .from("students")
          .update({ payer_id })
          .eq("id", s.id);
        if (es) mapErr("generateMonth.linkPayerToStudent", es);
      }

      const [Y, M] = ym.split("-").map(Number);
      const due_date = new Date(Date.UTC(Y, M - 1, Number(s.due_day || 5)))
        .toISOString()
        .slice(0, 10);

      const pyName = payerName.get(payer_id as string) || s.name;

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

    try {
      const { data, error } = await supabase
        .from("payments")
        .insert(toInsert)
        .select("*");
      if (error) mapErr("generateMonth.insertPayments", error);
      return data || [];
    } catch (err) {
      const e = err as Record<string, unknown>;
      if (e?.code === "23505") {
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

  async listPayments({
    ym,
    status = "all",
    page = 1,
    pageSize = 50,
  }: {
    ym: string;
    status?: string;
    page?: number;
    pageSize?: number;
  } = { ym: "" }): Promise<{ rows: PaymentRow[]; kpis: PaymentKpis }> {
    if (!ym) throw new Error("listPayments: 'ym' é obrigatório.");

    const mStart = monthStartOf(ym);
    const d = new Date(mStart);
    d.setMonth(d.getMonth() + 1);
    const monthEnd = d.toISOString().slice(0, 10);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabase
      .from("payments")
      .select(
        "id, student_id, payer_id, competence_month, due_date, amount, status, paid_at, canceled_at, cancel_note, student_name_snapshot, payer_name_snapshot",
        { count: "exact" }
      )
      .gte("due_date", mStart)
      .lt("due_date", monthEnd)
      .order("due_date", { ascending: true })
      .range(from, to);

    if (status && status !== "all") q = q.eq("status", status);

    const { data, error } = await q;
    if (error) mapErr("listPayments.query", error);

    const rows: PaymentRow[] = (data || []).map((r) => ({
      id: r.id,
      student_id: r.student_id,
      payer_id: r.payer_id,
      competence_month: r.competence_month,
      due_date: r.due_date,
      amount: r.amount,
      status: r.status as PaymentStatus,
      paid_at: r.paid_at,
      canceled_at: r.canceled_at,
      cancel_note: r.cancel_note,
      student_name: r.student_name_snapshot,
      payer_name: r.payer_name_snapshot,
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

    const today = new Date().toISOString().slice(0, 10);
    const kpis: PaymentKpis = {
      receita_a_receber: rows
        .filter((r) => r.status === "pending")
        .reduce((acc, r) => acc + Number(r.amount || 0), 0),
      receita_atrasada: rows
        .filter((r) => r.status === "pending" && r.due_date < today)
        .reduce((acc, r) => acc + Number(r.amount || 0), 0),
      receita_recebida: rows
        .filter((r) => r.status === "paid")
        .reduce((acc, r) => acc + Number(r.amount || 0), 0),
    };

    return { rows, kpis };
  },

  async markPaid(id: string): Promise<true> {
    if (!id) throw new Error("ID do pagamento é obrigatório.");
    const { error } = await supabase
      .from("payments")
      .update({ status: "paid", paid_at: new Date().toISOString(), canceled_at: null, cancel_note: null })
      .eq("id", id);
    if (error) mapErr("markPaid", error);
    return true;
  },

  async cancelPayment(id: string, note?: string | null): Promise<true> {
    if (!id) throw new Error("ID do pagamento é obrigatório.");
    const { error } = await supabase
      .from("payments")
      .update({ status: "canceled", canceled_at: new Date().toISOString(), cancel_note: note || null, paid_at: null })
      .eq("id", id);
    if (error) mapErr("cancelPayment", error);
    return true;
  },

  async reopenPayment(id: string): Promise<true> {
    if (!id) throw new Error("reopenPayment: 'id' é obrigatório.");

    const { data: row, error: e1 } = await supabase
      .from("payments")
      .select("id, tenant_id, student_id, competence_month")
      .eq("id", id)
      .single();
    if (e1) mapErr("reopenPayment.load", e1);
    if (!row) throw new Error("Pagamento não encontrado.");

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
      const ym = String(row.competence_month).slice(0, 7);
      const [Y, M] = ym.split("-");
      throw new Error(
        `Já existe uma mensalidade ativa para este aluno em ${M}/${Y}. ` +
          `Cancele a outra antes de reabrir esta.`
      );
    }

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

  async bulkMarkPaid(ids: string[]): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error("bulkMarkPaid: lista de ids é obrigatória");
    }
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          await paymentGateway.markPaid(id);
          succeeded.push(id);
        } catch (e) {
          failed.push({ id, error: e instanceof Error ? e.message : String(e) });
        }
      })
    );
    return { succeeded, failed };
  },

  async bulkReopenPayments(ids: string[]): Promise<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }> {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error("bulkReopenPayments: lista de ids é obrigatória");
    }
    const succeeded: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          await paymentGateway.reopenPayment(id);
          succeeded.push(id);
        } catch (e) {
          failed.push({ id, error: e instanceof Error ? e.message : String(e) });
        }
      })
    );
    return { succeeded, failed };
  },
};

import { supabase } from "../supabaseClient";
import { mapErr, monthStartOf, nextMonthStartOf, dueDateFor } from "./helpers";
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

export interface GenerateMonthResult {
  inserted: number;
  skipped_existing: number;
  created_payers: number;
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

// Alunos ativos com mensalidade > 0 que AINDA NÃO têm lançamento (não cancelado)
// no mês de competência. Fonte ÚNICA de verdade para a Prévia e para o Gerar —
// antes a Prévia comparava com as linhas da tela (sujeitas a filtro/paginação) e
// oferecia alunos que o Gerar pulava em silêncio (auditoria A1/A6).
// A existência é por competence_month (mesma chave do índice único parcial
// payments_unique_tenant_student_month, WHERE status <> 'canceled').
async function pendingStudentsForMonth(ym: string, ctx: string) {
  const monthStart = monthStartOf(ym);

  const { data: students, error: e1 } = await supabase
    .from("students")
    .select("id, name, monthly_value, due_day, payer_id, status")
    .eq("status", "ativo");
  if (e1) mapErr(`${ctx}.students`, e1);

  const candidates = (students || []).filter((s) => Number(s.monthly_value || 0) > 0);
  if (!candidates.length) return { monthStart, candidates, toProcess: [] as typeof candidates };

  const { data: existing, error: e2 } = await supabase
    .from("payments")
    .select("student_id")
    .eq("competence_month", monthStart)
    .neq("status", "canceled");
  if (e2) mapErr(`${ctx}.existing`, e2);

  const exists = new Set((existing || []).map((p) => p.student_id));
  return { monthStart, candidates, toProcess: candidates.filter((s) => !exists.has(s.id)) };
}

export const paymentGateway = {
  async previewGenerateMonth({ ym }: { ym: string }): Promise<PaymentPreview[]> {
    if (!ym) throw new Error("previewGenerateMonth: 'ym' é obrigatório.");

    const { monthStart, toProcess } = await pendingStudentsForMonth(ym, "previewGenerateMonth");

    return toProcess.map((s) => ({
      student_id: s.id,
      payer_id: s.payer_id || null,
      competence_month: monthStart,
      due_date: dueDateFor(ym, s.due_day),
      amount: Number(s.monthly_value || 0),
      status: "pending" as const,
      student_name_snapshot: s.name,
      _needs_payer: !s.payer_id,
    }));
  },

  async generateMonth({ ym }: { ym: string }): Promise<GenerateMonthResult> {
    if (!ym) throw new Error("generateMonth: 'ym' é obrigatório.");

    const { monthStart, candidates, toProcess } = await pendingStudentsForMonth(ym, "generateMonth");
    if (!candidates.length) return { inserted: 0, skipped_existing: 0, created_payers: 0 };
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

    let createdPayers = 0;
    const toInsert: Record<string, unknown>[] = [];
    for (const s of toProcess) {
      const amount = Number(s.monthly_value || 0);

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
          createdPayers += 1;
        }

        const { error: es } = await supabase
          .from("students")
          .update({ payer_id })
          .eq("id", s.id);
        if (es) mapErr("generateMonth.linkPayerToStudent", es);
      }

      const pyName = payerName.get(payer_id as string) || s.name;

      toInsert.push({
        student_id: s.id,
        payer_id,
        competence_month: monthStart,
        // Clamp 1..28 (igual ao cadastro do aluno): due_day 31 em fevereiro não
        // "transborda" para março e some da lista do mês.
        due_date: dueDateFor(ym, s.due_day),
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
    const skipped = candidates.length - toProcess.length;

    const { error } = await supabase.from("payments").insert(toInsert);
    if (!error) {
      return { inserted: toInsert.length, skipped_existing: skipped, created_payers: createdPayers };
    }

    // Duplicado em lote (corrida com o cron/outra aba) → o Postgres aborta o lote
    // INTEIRO. Checa o code CRU antes do mapErr (que descarta o code) e re-tenta
    // linha a linha ignorando os duplicados, sem perder os legítimos.
    if ((error as { code?: string }).code === "23505") {
      let inserted = 0;
      for (const row of toInsert) {
        const { error: er } = await supabase.from("payments").insert(row);
        if (er && (er as { code?: string }).code !== "23505") mapErr("generateMonth.insertRow", er);
        if (!er) inserted += 1;
      }
      return {
        inserted,
        skipped_existing: skipped + (toInsert.length - inserted),
        created_payers: createdPayers,
      };
    }

    return mapErr("generateMonth.insertPayments", error);
  },

  // Sem `pageSize` → traz o mês INTEIRO (pagina internamente de 1000 em 1000,
  // o teto do PostgREST). Antes o default era 50 e nenhuma tela repassava page:
  // escolas com > 50 mensalidades/mês viam a lista e os KPIs truncados (A2).
  async listPayments({
    ym,
    status = "all",
    page,
    pageSize,
  }: {
    ym: string;
    status?: string | null;
    page?: number;
    pageSize?: number;
  } = { ym: "" }): Promise<{ rows: PaymentRow[]; kpis: PaymentKpis }> {
    if (!ym) throw new Error("listPayments: 'ym' é obrigatório.");

    const mStart = monthStartOf(ym);
    // Janela [início do mês, início do mês seguinte) por string — antes usava
    // new Date(...)+setMonth em fuso local e errava a janela em BRT (A3).
    const monthEnd = nextMonthStartOf(ym);

    const buildQuery = (from: number, to: number) => {
      let q = supabase
        .from("payments")
        .select(
          "id, student_id, payer_id, competence_month, due_date, amount, status, paid_at, canceled_at, cancel_note, student_name_snapshot, payer_name_snapshot"
        )
        .gte("due_date", mStart)
        .lt("due_date", monthEnd)
        .order("due_date", { ascending: true })
        .order("id", { ascending: true }) // desempate estável entre páginas
        .range(from, to);
      if (status && status !== "all") q = q.eq("status", status);
      return q;
    };

    type DbRow = Omit<PaymentRow, "student_name" | "payer_name" | "days_overdue"> & {
      student_name_snapshot: string | null;
      payer_name_snapshot: string | null;
    };
    const data: DbRow[] = [];
    if (pageSize) {
      const from = ((page || 1) - 1) * pageSize;
      const { data: chunk, error } = await buildQuery(from, from + pageSize - 1);
      if (error) mapErr("listPayments.query", error);
      data.push(...(chunk || []));
    } else {
      const CHUNK = 1000;
      for (let from = 0; ; from += CHUNK) {
        const { data: chunk, error } = await buildQuery(from, from + CHUNK - 1);
        if (error) mapErr("listPayments.query", error);
        data.push(...(chunk || []));
        if (!chunk || chunk.length < CHUNK) break;
      }
    }

    const rows: PaymentRow[] = data.map((r) => ({
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

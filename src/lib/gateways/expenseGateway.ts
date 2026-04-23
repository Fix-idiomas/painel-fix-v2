import { supabase } from "../supabaseClient";
import { monthStartOf, clampDay1to28, tzToday, isRecurrenceActiveForMonth } from "./helpers";

export const expenseGateway = {
  async listExpenseTemplates(opts: { active?: boolean } = {}) {
    const { active = true } = opts;

    let q = supabase
      .from("expense_templates")
      .select(
        "id, title, category, amount, frequency, due_day, due_month, cost_center, active, created_at, updated_at, recurrence_mode, start_month, installments, end_month"
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
    recurrence_mode = 'indefinite',
    start_month = null,
    installments = null,
    end_month = null,
  }: Record<string, unknown>) {
    if (!title || String(title).trim() === "") {
      throw new Error("createExpenseTemplate: 'title' é obrigatório");
    }

    const mode = String(recurrence_mode || 'indefinite');
    const sm = start_month ? monthStartOf(String(start_month)) : null;
    const em = end_month ? monthStartOf(String(end_month)) : null;
    const inst = (installments ?? null) != null ? Math.max(1, Number(installments)) : null;

    if (mode === 'installments') {
      if (!inst) throw new Error("createExpenseTemplate: 'installments' é obrigatório quando recurrence_mode='installments'");
      if (em) throw new Error("createExpenseTemplate: 'end_month' deve ser nulo quando recurrence_mode='installments'");
    }
    if (mode === 'until_month') {
      if (!em) throw new Error("createExpenseTemplate: 'end_month' é obrigatório quando recurrence_mode='until_month'");
      if (inst) throw new Error("createExpenseTemplate: 'installments' deve ser nulo quando recurrence_mode='until_month'");
    }
    if (mode === 'indefinite') {
      if (inst || em) throw new Error("createExpenseTemplate: 'installments' e 'end_month' devem ser nulos quando recurrence_mode='indefinite'");
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
      recurrence_mode: mode,
      start_month: sm,
      installments: inst,
      end_month: em,
    };

    const { data, error } = await supabase
      .from("expense_templates")
      .insert([row])
      .select(
        "id, title, category, amount, frequency, due_day, due_month, cost_center, active, created_at, updated_at, recurrence_mode, start_month, installments, end_month"
      )
      .single();

    if (error) throw new Error(`createExpenseTemplate: ${error.message}`);
    return data;
  },

  async updateExpenseTemplate(id: string, changes: Record<string, unknown> = {}) {
    if (!id) throw new Error("updateExpenseTemplate: 'id' é obrigatório");

    const patch: Record<string, unknown> = {};
    if (changes.title !== undefined) {
      const t = String(changes.title || "").trim();
      if (!t) throw new Error("updateExpenseTemplate: 'title' não pode ficar vazio");
      patch.title = t;
    }
    if (changes.category !== undefined)     patch.category   = changes.category ?? null;
    if (changes.amount !== undefined)       patch.amount     = Number(changes.amount || 0);
    if (changes.frequency !== undefined)    patch.frequency  = String(changes.frequency || "monthly");
    if (changes.due_day !== undefined)      patch.due_day    = clampDay1to28(changes.due_day);
    if (changes.due_month !== undefined)    patch.due_month  = changes.due_month ?? null;
    if (changes.cost_center !== undefined)  patch.cost_center= changes.cost_center ?? "PJ";
    if (changes.active !== undefined)       patch.active     = !!changes.active;
    if (changes.recurrence_mode !== undefined) patch.recurrence_mode = String(changes.recurrence_mode || 'indefinite');
    if (changes.start_month !== undefined)     patch.start_month     = changes.start_month ? monthStartOf(String(changes.start_month)) : null;
    if (changes.installments !== undefined)    patch.installments    = (changes.installments ?? null) != null ? Math.max(1, Number(changes.installments)) : null;
    if (changes.end_month !== undefined)       patch.end_month       = changes.end_month ? monthStartOf(String(changes.end_month)) : null;

    const mode = patch.recurrence_mode ?? undefined;
    const inst = patch.installments ?? undefined;
    const em   = patch.end_month ?? undefined;
    if (mode === 'installments') {
      if (em !== null && em !== undefined) {
        throw new Error("updateExpenseTemplate: 'end_month' deve ser nulo quando recurrence_mode='installments'");
      }
      if (inst === null || inst === undefined) {
        throw new Error("updateExpenseTemplate: 'installments' é obrigatório quando recurrence_mode='installments'");
      }
    }
    if (mode === 'until_month') {
      if (inst !== null && inst !== undefined) {
        throw new Error("updateExpenseTemplate: 'installments' deve ser nulo quando recurrence_mode='until_month'");
      }
      if (em === null || em === undefined) {
        throw new Error("updateExpenseTemplate: 'end_month' é obrigatório quando recurrence_mode='until_month'");
      }
    }
    if (mode === 'indefinite') {
      if (inst !== null && inst !== undefined) throw new Error("updateExpenseTemplate: 'installments' deve ser nulo quando recurrence_mode='indefinite'");
      if (em   !== null && em   !== undefined) throw new Error("updateExpenseTemplate: 'end_month' deve ser nulo quando recurrence_mode='indefinite'");
    }

    const { data, error } = await supabase
      .from("expense_templates")
      .update(patch)
      .eq("id", id)
      .select(
        "id, title, category, amount, frequency, due_day, due_month, cost_center, active, created_at, updated_at, recurrence_mode, start_month, installments, end_month"
      )
      .single();

    if (error) throw new Error(`updateExpenseTemplate: ${error.message}`);
    return data;
  },

  async deleteExpenseTemplate(id: string) {
    if (!id) throw new Error("deleteExpenseTemplate: 'id' é obrigatório");
    const { error } = await supabase
      .from("expense_templates")
      .delete()
      .eq("id", id);
    if (error) throw new Error(`deleteExpenseTemplate: ${error.message}`);
    return true;
  },

  async listExpenseEntries({ ym, status = "all", cost_center = null }: { ym?: string; status?: string; cost_center?: string | null } = {}) {
    const mStart = monthStartOf(ym);

    let q = supabase
      .from("expense_entries")
      .select(
        "id, template_id, title_snapshot, category, amount, competence_month, due_date, status, paid_at, canceled_at, cancel_note, cost_center, created_at, updated_at"
      )
      .eq("competence_month", mStart)
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
          ? Math.max(0, Math.floor((new Date(today).getTime() - new Date(p.due_date).getTime()) / 86400000))
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

  async listExpenseCategories() {
    try {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("id, name, active, created_at, updated_at")
        .order("active", { ascending: false })
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (e) {
      const code = e?.code || e?.details || e?.message || "";
      if (String(code).includes("relation") || String(code).includes("does not exist") || String(code).includes("42P01")) {
        const out = new Set();
        try {
          const { data: e1 } = await supabase
            .from("expense_entries")
            .select("category")
            .not("category", "is", null)
            .limit(2000);
          for (const r of e1 || []) if (r.category) out.add(String(r.category));
        } catch {}
        try {
          const { data: t1 } = await supabase
            .from("expense_templates")
            .select("category")
            .not("category", "is", null)
            .limit(2000);
          for (const r of t1 || []) if (r.category) out.add(String(r.category));
        } catch {}
        return Array.from(out).sort().map((name) => ({ id: null, name, active: true }));
      }
      throw e;
    }
  },

  async createExpenseCategory({ name, active = true }) {
    const n = String(name || "").trim();
    if (!n) throw new Error("createExpenseCategory: 'name' é obrigatório");
    const { data, error } = await supabase
      .from("expense_categories")
      .insert({ name: n, active: !!active })
      .select("id, name, active, created_at, updated_at")
      .single();
    if (error) throw new Error(`createExpenseCategory: ${error.message}`);
    return data;
  },

  async updateExpenseCategory(id: string, changes: Record<string, unknown> = {}) {
    if (!id) throw new Error("updateExpenseCategory: 'id' é obrigatório");
    const patch: Record<string, unknown> = {};
    if (changes.name !== undefined) {
      const n = String(changes.name || "").trim();
      if (!n) throw new Error("updateExpenseCategory: 'name' não pode ficar vazio");
      patch.name = n;
    }
    if (changes.active !== undefined) patch.active = !!changes.active;
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("expense_categories")
      .update(patch)
      .eq("id", id)
      .select("id, name, active, created_at, updated_at")
      .single();
    if (error) throw new Error(`updateExpenseCategory: ${error.message}`);
    return data;
  },

  async deleteExpenseCategory(id) {
    if (!id) throw new Error("deleteExpenseCategory: 'id' é obrigatório");
    const { error } = await supabase
      .from("expense_categories")
      .delete()
      .eq("id", id);
    if (error) throw new Error(`deleteExpenseCategory: ${error.message}`);
    return true;
  },

  async deleteExpenseEntry(id: string) {
    if (!id) throw new Error("deleteExpenseEntry: 'id' é obrigatório");
    const { error } = await supabase
      .from("expense_entries")
      .delete()
      .eq("id", id);
    if (error) throw new Error(`deleteExpenseEntry: ${error.message}`);
    return true;
  },

  async createExpenseEntry({
    due_date,
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

    const ym = d.slice(0, 7);
    const mStart = `${ym}-01`;

    const row = {
      template_id: null,
      title_snapshot: desc,
      category: category ?? null,
      amount: val,
      competence_month: mStart,
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

  async createOneOffExpense({
    date,
    amount,
    title,
    category = null,
    cost_center = "PJ",
  }) {
    return this.createExpenseEntry({
      due_date: date,
      amount,
      description: title,
      category,
      cost_center,
    });
  },

  async markExpensePaid(id: string) {
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

  async cancelExpense(id: string, note: string | null = null) {
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
      .select("id, status, canceled_at, cancel_note, paid_at, updated_at")
      .single();

    if (error) throw new Error(`cancelExpense: ${error.message}`);
    return data;
  },

  async reopenExpense(id: string) {
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

  async previewGenerateExpenses({ ym, cost_center = null }: { ym?: string; cost_center?: string | null } = {}) {
    const mStart = monthStartOf(ym);
    const [Y, M] = mStart.slice(0, 7).split("-").map(Number);

    let qt = supabase
      .from("expense_templates")
      .select("id, title, category, amount, frequency, due_day, due_month, cost_center, active, recurrence_mode, start_month, installments, end_month")
      .eq("active", true);
    if (cost_center) qt = qt.eq("cost_center", cost_center);

    const { data: templates, error: eT } = await qt;
    if (eT) throw new Error(`previewGenerateExpenses (templates): ${eT.message}`);

    const { data: existing, error: eX } = await supabase
      .from("expense_entries")
      .select("template_id")
      .eq("competence_month", mStart);
    if (eX) throw new Error(`previewGenerateExpenses (existing): ${eX.message}`);

    const existingSet = new Set((existing || []).map((r) => r.template_id).filter(Boolean));

    const preview = [];
    for (const t of (templates || [])) {
      if (!isRecurrenceActiveForMonth(t, mStart)) continue;
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
        competence_month: mStart,
        due_date,
        status: "pending",
        cost_center: t.cost_center || "PJ",
        _from_template: true,
      });
    }

    return preview;
  },

  async generateExpenses({ ym, cost_center = null }: { ym?: string; cost_center?: string | null } = {}) {
    const mStart = monthStartOf(ym);
    const [Y, M] = mStart.slice(0, 7).split("-").map(Number);

    let qt = supabase
      .from("expense_templates")
      .select("id, title, category, amount, frequency, due_day, due_month, cost_center, active, recurrence_mode, start_month, installments, end_month")
      .eq("active", true);
    if (cost_center) qt = qt.eq("cost_center", cost_center);

    const { data: templates, error: eT } = await qt;
    if (eT) throw new Error(`generateExpenses (templates): ${eT.message}`);

    const { data: existing, error: eX } = await supabase
      .from("expense_entries")
      .select("template_id")
      .eq("competence_month", mStart);
    if (eX) throw new Error(`generateExpenses (existing): ${eX.message}`);

    const existingSet = new Set((existing || []).map((r) => r.template_id).filter(Boolean));

    const toInsert = [];
    for (const t of (templates || [])) {
      if (!isRecurrenceActiveForMonth(t, mStart)) continue;
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
        competence_month: mStart,
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
};

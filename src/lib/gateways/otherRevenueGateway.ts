import { supabase } from "../supabaseClient";
import { monthStartOf, clampDay1to28, dueDateFor, normalizeDate, tzToday, hasAuthSession, getTenantId } from "./helpers";

// Circuit breakers (módulo-scoped, preserva estado na sessão)
let HAS_RPC_ENSURE_OTHER_REVENUES = undefined;
let HAS_OTHER_REVENUE_EXT_COLUMNS = undefined;
const LS_EXT_COLS_KEY = "fix.or.hasExtCols";
function _getExtColsFromLS() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const v = window.localStorage.getItem(LS_EXT_COLS_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
    return null;
  } catch { return null; }
}
function _setExtColsToLS(val) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(LS_EXT_COLS_KEY, val ? "1" : "0");
  } catch {}
}

export const otherRevenueGateway = {
  async createOtherRevenueTemplate({
    title,
    amount,
    frequency = "monthly",
    recurrence_type = "indefinite",
    due_day = 5,
    due_month = null,
    start_month = null,
    end_month = null,
    active = true,
    cost_center = "extra",
    category = null,
  }: Record<string, unknown> = {}) {
    const finalTitle = String(title || "").trim();
    if (!finalTitle) throw new Error("createOtherRevenueTemplate: 'title' é obrigatório");
    const finalAmount = Number(amount || 0);
    let tenant_id = null;
    try { tenant_id = await getTenantId(); } catch {}

    const row = {
      ...(tenant_id ? { tenant_id } : {}),
      title: finalTitle,
      amount: finalAmount,
      frequency: String(frequency || "monthly"),
      recurrence_type: String(recurrence_type || "indefinite"),
      due_day: clampDay1to28(due_day),
      due_month: due_month ? Number(due_month) : null,
      start_month: start_month ? monthStartOf(String(start_month)) : monthStartOf(tzToday("America/Sao_Paulo").slice(0,7)),
      end_month: end_month ? monthStartOf(String(end_month)) : null,
      active: active !== false,
      cost_center: cost_center || "extra",
      category: category || null,
    };

    const essentialKeys = new Set(["title","amount","due_day","frequency","recurrence_type","start_month","active"]);
    const attemptRow = { ...row };
    let tries = 0;
    while (tries < 8) {
      const { data, error } = await supabase
        .from("other_revenue_templates")
        .insert([attemptRow])
        .select("id, title, amount, frequency, recurrence_type, due_day, due_month, start_month, end_month, active, cost_center, category, created_at")
        .single();
      if (!error) return data;

      const msg = String(error.message || error.details || "");
      const isMissing = /42703|column|does not exist|unknown column/i.test(msg);
      const isCheck = /23514|check constraint|violates check constraint/i.test(msg);
      if (!isMissing && !isCheck) throw new Error(`createOtherRevenueTemplate: ${error.message}`);
      if (isCheck && /recurrence_type/i.test(msg)) {
        const val = String(attemptRow.recurrence_type || "");
        let mapped = val;
        if (val === "indefinite") mapped = "indefinido";
        else if (val === "installments") mapped = "parcelado";
        else if (val === "until_month") mapped = "ate_mes";
        if (mapped !== val) {
          attemptRow.recurrence_type = mapped;
          tries++;
          continue;
        }
      }
      const m = msg.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation/i) || msg.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+does\s+not\s+exist/i);
      const col = m && m[1] ? m[1] : null;
      if (!col || essentialKeys.has(col) || attemptRow[col] === undefined) {
        for (const k of ["category","cost_center","due_month","end_month"]) {
          if (attemptRow[k] !== undefined && !essentialKeys.has(k)) delete attemptRow[k];
        }
      } else {
        delete attemptRow[col];
      }
      tries++;
    }
    throw new Error("createOtherRevenueTemplate: não foi possível inserir (colunas ausentes)");
  },

  async ensureOtherRevenuesForMonth(ym: string) {
    if (!ym || String(ym).length < 7) throw new Error("ensureOtherRevenuesForMonth: 'ym' deve ser 'YYYY-MM'");
    const ymStr = String(ym).slice(0, 7);
    try {
      const { data, error } = await supabase.rpc("ensure_other_revenues_for_month", { p_ym: ymStr });
      if (error) throw error;
      return data;
    } catch (e) {
      const msg = e?.message || String(e);
      throw new Error(`[ensure_other_revenues_for_month] ${msg}`);
    }
  },

  async listOtherRevenues({ ym, status = "all", cost_center = null }: { ym?: string; status?: string; cost_center?: string | null } = {}) {
    const mStart = monthStartOf(ym);
    const isCurrentMonth = (() => {
      const today = tzToday("America/Sao_Paulo");
      return mStart.slice(0, 7) === today.slice(0, 7);
    })();

    if (isCurrentMonth && HAS_RPC_ENSURE_OTHER_REVENUES !== false) {
      try {
        const authed = await hasAuthSession();
        if (authed) {
          const ymStr = mStart.slice(0, 7);
          await supabase.rpc("ensure_other_revenues_for_month", { p_ym: ymStr });
          HAS_RPC_ENSURE_OTHER_REVENUES = true;
        }
      } catch (e) {
        HAS_RPC_ENSURE_OTHER_REVENUES = false;
        console.info("[other_revenues] auto-geração desabilitada nesta sessão:", e?.message || e);
      }
    }

    const baseFields = "id, title, category, amount, competence_month, due_date, status, paid_at, canceled_at, cancel_note, cost_center, created_at, updated_at";
    const extendedFields = [
      baseFields,
      "template_id",
      "recurrence_kind",
      "frequency",
      "installment_index",
      "installments_total",
      "start_month",
      "end_month",
      "generated_at",
    ].join(", ");

    const buildQuery = (fields) => {
      let q = supabase
        .from("other_revenues")
        .select(fields)
        .eq("competence_month", mStart)
        .order("due_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (cost_center && cost_center !== "all") q = q.eq("cost_center", cost_center);
      if (status && status !== "all") q = q.eq("status", status);
      return q;
    };

    let data = null;
    let error = null;
    if (HAS_OTHER_REVENUE_EXT_COLUMNS === undefined) {
      const stored = _getExtColsFromLS();
      if (stored !== null) HAS_OTHER_REVENUE_EXT_COLUMNS = stored;
    }

    if (HAS_OTHER_REVENUE_EXT_COLUMNS !== false) {
      const res = await buildQuery(extendedFields);
      data = res.data; error = res.error;
      if (error) {
        const msg = String(error.message || error);
        const isMissingColumn = /42703|column|does not exist|unknown column/i.test(msg);
        if (!isMissingColumn) {
          throw new Error(`listOtherRevenues: ${error.message}`);
        }
        HAS_OTHER_REVENUE_EXT_COLUMNS = false;
        _setExtColsToLS(false);
      } else {
        HAS_OTHER_REVENUE_EXT_COLUMNS = true;
        _setExtColsToLS(true);
      }
    }
    if (!data || HAS_OTHER_REVENUE_EXT_COLUMNS === false) {
      const res2 = await buildQuery(baseFields);
      data = res2.data; error = res2.error;
      if (error) throw new Error(`listOtherRevenues: ${error.message}`);
    }

    const today = tzToday("America/Sao_Paulo");
    const rows = (data || []).map((r) => {
      const days_overdue =
        r.status === "pending" && r.due_date < today
          ? Math.max(0, Math.floor((new Date(today).getTime() - new Date(r.due_date).getTime()) / 86400000))
          : 0;
      const is_generated = r && Object.prototype.hasOwnProperty.call(r, "template_id")
        ? r.template_id != null
        : false;
      return { ...r, days_overdue, is_generated };
    });

    const sum = (arr) => arr.reduce((acc, it) => acc + Number(it.amount || 0), 0);

    return {
      rows,
      kpis: {
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
    installment_index = null,
    installments_total = null,
    recurrence_kind = null,
    frequency = null,
    start_month = null,
    end_month = null,
  }: Record<string, unknown> = {}) {
    const mStart = monthStartOf(ym != null ? String(ym) : undefined);

    const finalTitle = String(title || "").trim();
    if (!finalTitle) throw new Error("createOtherRevenue: 'title' é obrigatório");

    const finalAmount = Number(amount || 0);
    const finalDueDate = due_date
      ? normalizeDate(due_date)
      : dueDateFor(mStart.slice(0, 7), 5);

    const baseRow = {
      title: finalTitle,
      category: category ?? null,
      amount: finalAmount,
      competence_month: mStart,
      due_date: finalDueDate,
      status: "pending",
      paid_at: null,
      canceled_at: null,
      cancel_note: null,
      cost_center: cost_center ?? "extra",
      installment_index: installment_index ?? null,
      installments_total: installments_total ?? null,
      recurrence_kind: recurrence_kind ?? (installments_total ? "installments" : null),
      frequency: frequency ?? (installments_total ? "monthly" : null),
      start_month: start_month ?? null,
      end_month: end_month ?? null,
    };

    let data = null; let error = null;
    const tryExtended = HAS_OTHER_REVENUE_EXT_COLUMNS !== false;
    if (tryExtended) {
      const insertSelect = "id, title, category, amount, competence_month, due_date, status, paid_at, canceled_at, cancel_note, cost_center, created_at, updated_at, installment_index, installments_total, recurrence_kind, frequency, start_month, end_month";
      const attemptRow = { ...baseRow };
      let tries = 0;
      while (tries < 3 && !data) {
        const res = await supabase
          .from("other_revenues")
          .insert([attemptRow])
          .select(insertSelect)
          .single();
        data = res.data; error = res.error;
        if (!error) break;
        const msg = String(error.message || "");
        const isMissingColumn = /42703|PGRST204|column|does not exist|unknown column/i.test(msg);
        const isCheck = /23514|check constraint|violates check constraint/i.test(msg);
        if (isMissingColumn) {
          HAS_OTHER_REVENUE_EXT_COLUMNS = false;
          _setExtColsToLS(false);
          break;
        }
        if (isCheck && /recurrence_kind/i.test(msg)) {
          const val = String(attemptRow.recurrence_kind || "");
          let mapped = val;
          if (val === "indefinite") mapped = "indefinido";
          else if (val === "installments") mapped = "parcelado";
          else if (val === "until_month") mapped = "ate_mes";
          if (mapped !== val) {
            attemptRow.recurrence_kind = mapped;
            tries++;
            continue;
          }
          delete attemptRow.recurrence_kind;
          tries++;
          continue;
        }
        break;
      }
    }
    if (!data || error) {
      const minimalRow = { ...baseRow };
      delete minimalRow.installment_index;
      delete minimalRow.installments_total;
      delete minimalRow.recurrence_kind;
      delete minimalRow.frequency;
      delete minimalRow.start_month;
      delete minimalRow.end_month;
      const retry = await supabase
        .from("other_revenues")
        .insert([minimalRow])
        .select("id, title, category, amount, competence_month, due_date, status, paid_at, canceled_at, cancel_note, cost_center, created_at, updated_at")
        .single();
      data = retry.data; error = retry.error;
    }

    if (error) throw new Error(`createOtherRevenue: ${error.message}`);
    return data;
  },

  async markOtherRevenuePaid(id: string) {
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

  async cancelOtherRevenue(id: string, note: string | null = null) {
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

  async reopenOtherRevenue(id: string) {
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

  async cancelOtherRevenueSeriesFrom(id: string, note: string | null = null) {
    if (!id) throw new Error("cancelOtherRevenueSeriesFrom: 'id' é obrigatório");
    let ref = null;
    {
      const res = await supabase
        .from("other_revenues")
        .select("id,status,title,due_date,recurrence_kind,generated_from,installment_index,installments_total")
        .eq("id", id)
        .single();
      if (res.error) {
        const msg = String(res.error.message || "");
        const missing = /42703|column|does not exist|unknown column/i.test(msg);
        if (!missing) throw new Error(`cancelOtherRevenueSeriesFrom.select: ${res.error.message}`);
        const fallback = await supabase
          .from("other_revenues")
          .select("id,status,title,due_date")
          .eq("id", id)
          .single();
        if (fallback.error) throw new Error(`cancelOtherRevenueSeriesFrom.select.fallback: ${fallback.error.message}`);
        ref = fallback.data;
      } else {
        ref = res.data;
      }
    }

    const parseParcel = (title) => {
      const m = String(title || "").match(/\((\d+)\s*\/\s*(\d+)\)\s*$/);
      return m ? { index: Number(m[1]), total: Number(m[2]) } : { index: 0, total: 0 };
    };
    const p = ref.installments_total ? { index: Number(ref.installment_index || 0), total: Number(ref.installments_total || 0) } : parseParcel(ref.title);
    if (!p.total || p.total < 2) {
      const ok = await this.cancelOtherRevenue(id, note);
      if (ref.generated_from) {
        try {
          const { error: tplErr } = await supabase
            .from("other_revenue_templates")
            .update({ active: false })
            .eq("id", ref.generated_from);
          if (tplErr) {
            console.warn("cancelOtherRevenueSeriesFrom.templateDeactivate:", tplErr.message || tplErr);
          }
        } catch (e) {
          console.warn("cancelOtherRevenueSeriesFrom.templateDeactivate.catch:", e?.message || e);
        }
      }
      return ok;
    }
    const idx = Math.max(1, Number(p.index || 1));

    const patch = {
      status: "canceled",
      canceled_at: new Date().toISOString(),
      cancel_note: note || null,
      paid_at: null,
    };

    let q = supabase.from("other_revenues").update(patch).eq("status", "pending");
    if (ref.generated_from) {
      q = q.eq("generated_from", ref.generated_from).gte("installment_index", idx);
    } else if (ref.installments_total) {
      q = q.eq("installments_total", p.total).gte("installment_index", idx);
      const base = String(ref.title || "").replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, "");
      if (base) q = q.ilike("title", `${base}%`);
    } else if (ref.due_date) {
      const base = String(ref.title || "").replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, "");
      q = q.gte("due_date", String(ref.due_date).slice(0,10));
      if (base) q = q.ilike("title", `${base}%`);
    }

    const { data, error } = await q.select("id");
    if (error) throw new Error(`cancelOtherRevenueSeriesFrom.update: ${error.message}`);

    if (ref.generated_from) {
      try {
        const { error: tplErr } = await supabase
          .from("other_revenue_templates")
          .update({ active: false })
          .eq("id", ref.generated_from);
        if (tplErr) {
          console.warn("cancelOtherRevenueSeriesFrom.templateDeactivate:", tplErr.message || tplErr);
        }
      } catch (e) {
        console.warn("cancelOtherRevenueSeriesFrom.templateDeactivate.catch:", e?.message || e);
      }
    }

    return { canceled_count: Array.isArray(data) ? data.length : 0 };
  },

  async deleteOtherRevenue(id: string) {
    if (!id) throw new Error("deleteOtherRevenue: 'id' é obrigatório");
    let generated_from = null;
    try {
      const sel = await supabase
        .from("other_revenues")
        .select("id, generated_from")
        .eq("id", id)
        .single();
      if (!sel.error && sel.data) generated_from = sel.data.generated_from || null;
    } catch {}
    try {
      const { error } = await supabase.rpc("safe_delete_other_revenue", { p_id: id, p_mode: "auto" });
      if (!error) {
        await this._deactivateTemplateIfNeeded(generated_from);
        return true;
      }
      const msg = String(error.message || "");
      const rpcMissing = /PGRST202|schema cache|does not exist|404|function not found/i.test(msg);
      const rpcDenied  = /permission|execute privilege|not allowed/i.test(msg);
      if (!rpcMissing && !rpcDenied) {
        throw new Error(`RPC safe_delete_other_revenue: ${error.message}`);
      }
    } catch {
      // ignore and try direct paths
    }

    const res = await supabase.from("other_revenues").delete().eq("id", id);
    if (!res.error) {
      await this._deactivateTemplateIfNeeded(generated_from);
      return true;
    }
    const msg = String(res.error.message || res.error);
    const likelyPolicy = /RLS|policy|permission|not\s+allowed|violates row-level security/i.test(msg);
    const likelyFK      = /foreign key|violates foreign key constraint|still referenced/i.test(msg);
    if (likelyPolicy || likelyFK) {
      try {
        await this.cancelOtherRevenue(id, "soft-delete fallback");
        await this._deactivateTemplateIfNeeded(generated_from);
        return true;
      } catch (e) {
        throw new Error(`deleteOtherRevenue: ${res.error.message} | fallback cancel failed: ${e?.message || e}`);
      }
    }
    throw new Error(`deleteOtherRevenue: ${res.error.message}`);
  },

  async _deactivateTemplateIfNeeded(templateId: string) {
    if (!templateId) return;
    try {
      const { error } = await supabase
        .from("other_revenue_templates")
        .update({ active: false })
        .eq("id", templateId);
      if (error) console.warn("_deactivateTemplateIfNeeded:", error.message || error);
    } catch (e) {
      console.warn("_deactivateTemplateIfNeeded.catch:", e?.message || e);
    }
  },

  async deleteOtherRevenueSeriesFrom(id: string) {
    if (!id) throw new Error("deleteOtherRevenueSeriesFrom: 'id' é obrigatório");
    let ref = null;
    {
      const res = await supabase
        .from("other_revenues")
        .select("id,status,title,due_date,generated_from,installment_index,installments_total")
        .eq("id", id)
        .single();
      if (res.error) {
        const msg = String(res.error.message || "");
        const missing = /42703|column|does not exist|unknown column/i.test(msg);
        if (!missing) throw new Error(`deleteOtherRevenueSeriesFrom.select: ${res.error.message}`);
        const fallback = await supabase
          .from("other_revenues")
          .select("id,status,title,due_date")
          .eq("id", id)
          .single();
        if (fallback.error) throw new Error(`deleteOtherRevenueSeriesFrom.select.fallback: ${fallback.error.message}`);
        ref = fallback.data;
      } else {
        ref = res.data;
      }
    }

    const parseParcel = (title) => {
      const m = String(title || "").match(/\((\d+)\s*\/\s*(\d+)\)\s*$/);
      return m ? { index: Number(m[1]), total: Number(m[2]) } : { index: 0, total: 0 };
    };
    const p = ref.installments_total ? { index: Number(ref.installment_index || 0), total: Number(ref.installments_total || 0) } : parseParcel(ref.title);
    if (!p.total || p.total < 2) {
      const { error: eDel } = await supabase.from("other_revenues").delete().eq("id", id);
      if (eDel) {
        try {
          await this.cancelOtherRevenue(id, "soft-delete fallback");
        } catch (e) {
          throw new Error(`deleteOtherRevenueSeriesFrom.deleteSingle: ${eDel.message} | fallback cancel failed: ${e?.message || e}`);
        }
      }
      if (ref.generated_from) {
        try {
          const { error: tplErr } = await supabase
            .from("other_revenue_templates")
            .update({ active: false })
            .eq("id", ref.generated_from);
          if (tplErr) {
            console.warn("deleteOtherRevenueSeriesFrom.templateDeactivate:", tplErr.message || tplErr);
          }
        } catch (e) {
          console.warn("deleteOtherRevenueSeriesFrom.templateDeactivate.catch:", e?.message || e);
        }
      }
      return { deleted_count: 1 };
    }

    const idx = Math.max(1, Number(p.index || 1));

    let q = supabase.from("other_revenues").delete().eq("status", "pending");
    if (ref.generated_from) {
      q = q.eq("generated_from", ref.generated_from).gte("installment_index", idx);
    } else if (ref.installments_total) {
      q = q.eq("installments_total", p.total).gte("installment_index", idx);
      const base = String(ref.title || "").replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, "");
      if (base) q = q.ilike("title", `${base}%`);
    } else if (ref.due_date) {
      const base = String(ref.title || "").replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, "");
      q = q.gte("due_date", String(ref.due_date).slice(0,10));
      if (base) q = q.ilike("title", `${base}%`);
    }

    let data = null; let error = null;
    const delRes = await q.select("id");
    data = delRes.data; error = delRes.error;
    if (error) {
      const msg = String(error.message || error);
      const likelyPolicy = /RLS|policy|permission|not\s+allowed|violates row-level security/i.test(msg);
      const likelyFK      = /foreign key|violates foreign key constraint|still referenced/i.test(msg);
      if (likelyPolicy || likelyFK) {
        const patch = {
          status: "canceled",
          canceled_at: new Date().toISOString(),
          cancel_note: "soft-delete fallback",
          paid_at: null,
        };
        let uq = supabase.from("other_revenues").update(patch).eq("status", "pending");
        if (ref.generated_from) {
          uq = uq.eq("generated_from", ref.generated_from).gte("installment_index", idx);
        } else if (ref.installments_total) {
          uq = uq.eq("installments_total", p.total).gte("installment_index", idx);
          const base2 = String(ref.title || "").replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, "");
          if (base2) uq = uq.ilike("title", `${base2}%`);
        } else if (ref.due_date) {
          const base2 = String(ref.title || "").replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, "");
          uq = uq.gte("due_date", String(ref.due_date).slice(0,10));
          if (base2) uq = uq.ilike("title", `${base2}%`);
        }
        const upRes = await uq.select("id");
        if (upRes.error) throw new Error(`deleteOtherRevenueSeriesFrom.delete: ${error.message} | fallback cancel failed: ${upRes.error.message}`);
        data = upRes.data;
      } else {
        throw new Error(`deleteOtherRevenueSeriesFrom.delete: ${error.message}`);
      }
    }

    if (ref.generated_from) {
      try {
        const { error: tplErr } = await supabase
          .from("other_revenue_templates")
          .update({ active: false })
          .eq("id", ref.generated_from);
        if (tplErr) {
          console.warn("deleteOtherRevenueSeriesFrom.templateDeactivate:", tplErr.message || tplErr);
        }
      } catch (e) {
        console.warn("deleteOtherRevenueSeriesFrom.templateDeactivate.catch:", e?.message || e);
      }
    }

    return { deleted_count: Array.isArray(data) ? data.length : 0 };
  },

  async updateOtherRevenue(id: string, changes: Record<string, unknown> = {}, { syncCompetenceWithDueDate = false }: { syncCompetenceWithDueDate?: boolean } = {}) {
    if (!id) throw new Error("updateOtherRevenue: 'id' é obrigatório");

    const patch: Record<string, unknown> = {};

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
      const s = String(changes.due_date || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        throw new Error("updateOtherRevenue: 'due_date' deve ser YYYY-MM-DD");
      }
      patch.due_date = s;

      if (syncCompetenceWithDueDate) {
        const ym = s.slice(0, 7);
        patch.competence_month = `${ym}-01`;
      }
    }

    if (changes.category !== undefined) {
      patch.category = changes.category ? String(changes.category).trim() : null;
    }

    if (changes.cost_center !== undefined) {
      patch.cost_center = changes.cost_center ? String(changes.cost_center).trim() : "extra";
    }

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
};

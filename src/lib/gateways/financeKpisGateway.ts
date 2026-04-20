import { supabase } from "../supabaseClient";
import { mapErr, monthStartOf, tzToday } from "./helpers";
import { paymentGateway } from "./paymentGateway";
import { otherRevenueGateway } from "./otherRevenueGateway";
import { teacherGateway } from "./teacherGateway";
import type { MonthlyFinanceKpis, CombinedRevenueKpis, FinancialSummary } from "@/types";

export const financeKpisGateway = {
  async getMonthlyFinanceKpis({ ym, cost_center = null }: { ym: string; tenant_id?: string; cost_center?: string | null }): Promise<MonthlyFinanceKpis> {
    const mStart = monthStartOf(ym);
    const monthEnd = (() => {
      const d = new Date(`${ym}-01T00:00:00`);
      d.setMonth(d.getMonth() + 1);
      return d.toISOString().slice(0, 10);
    })();
    const today = tzToday("America/Sao_Paulo");

    const qPay = supabase
      .from("payments")
      .select("amount,status,due_date,paid_at")
      .gte("due_date", mStart)
      .lt("due_date", monthEnd);
    const { data: payRows, error: e1 } = await qPay;
    if (e1) mapErr("getMonthlyFinanceKpis.payments", e1);

    const sum = (arr) => arr.reduce((a, b) => a + Number(b.amount || 0), 0);
    const rows = payRows || [];
    const revenue = {
      total_billed: sum(rows.filter(r => r.status !== "canceled")),
      paid: sum(rows.filter(r => r.paid_at != null)),
      pending: sum(rows.filter(r => r.status === "pending")),
      overdue: sum(rows.filter(r => r.status === "pending" && r.due_date < today)),
    };

    let q = supabase
      .from("expense_entries")
      .select("amount,status,due_date,cost_center")
      .gte("due_date", mStart)
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

    const by_cost_center_map: Record<string, { total: number; paid: number; pending: number; overdue: number }> = {};
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

  async reportReceivablesAging({ ym, tenant_id }: { ym: string; tenant_id?: string }) {
    if (!ym) throw new Error("reportReceivablesAging: 'ym' é obrigatório");
    const mStart = monthStartOf(ym);
    const today = tzToday("America/Sao_Paulo");

    let q = supabase
      .from("payments")
      .select("id, tenant_id, student_id, payer_id, amount, due_date, status, competence_month, student_name_snapshot, payer_name_snapshot")
      .eq("competence_month", mStart)
      .eq("status", "pending");

    if (tenant_id) q = q.eq("tenant_id", tenant_id);

    const { data, error } = await q;
    if (error) mapErr("reportReceivablesAging.select", error);

    const rows = (data || [])
      .filter(r => r.due_date && r.due_date < today)
      .map(r => {
        const due = new Date(`${r.due_date}T00:00:00`);
        const ref = new Date(`${today}T00:00:00`);
        const days_overdue = Math.max(0, Math.floor((ref.getTime() - due.getTime()) / 86400000));
        return {
          ...r,
          days_overdue,
          payer_name: r.payer_name_snapshot ?? "—",
          student_name: r.student_name_snapshot ?? "—",
        };
      });

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
      rows,
    };
  },

  async getCombinedRevenueKpis({ ym }: { ym: string }): Promise<CombinedRevenueKpis> {
    const [pays, others] = await Promise.all([
      paymentGateway.listPayments({ ym, status: "all" }),
      otherRevenueGateway.listOtherRevenues({ ym, status: "all" }),
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

    const total = received + overdue + upcoming;

    return { total, received, upcoming, overdue };
  },

  async getMonthlyFinancialSummary({ ym }: { ym?: string; cost_center?: string | null } = {}): Promise<FinancialSummary> {
    const base = await this.getMonthlyFinanceKpis({ ym, cost_center: null });
    const receita   = Number(base?.revenue?.total_billed || 0);
    const pagosRec  = Number(base?.revenue?.paid || 0);
    const despTotal = Number(base?.expense?.total || 0);
    const despPagas = Number(base?.expense?.paid || 0);
    const by_cost_center = Array.isArray(base?.by_cost_center) ? base.by_cost_center : [];

    const teachers = await teacherGateway.listTeachers();
    const payouts = await Promise.all(
      (teachers || []).map((t) => teacherGateway.sumTeacherPayoutByMonth(t.id, ym))
    );
    const professores = payouts.reduce((acc, p) => acc + Number(p?.amount || 0), 0);

    const despesas = despTotal + professores;

    const toKey = (s) => String(s || "").trim().toLowerCase();
    const totalPJ = by_cost_center
      .filter((cc) => toKey(cc.cost_center) === "pj")
      .reduce((a, cc) => a + Number(cc.total || 0), 0);
    const totalPF = by_cost_center
      .filter((cc) => toKey(cc.cost_center) === "pf")
      .reduce((a, cc) => a + Number(cc.total || 0), 0);

    const despesas_pj = totalPJ + professores;
    const despesas_pf = totalPF;

    const saldo = pagosRec - despPagas;
    const saldo_operacional = receita - despesas;

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
  },
};

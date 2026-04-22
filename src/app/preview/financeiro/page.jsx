"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PreviewShell from "../_components/PreviewShell";
import { financeGateway } from "@/lib/financeGateway";
import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Receipt,
  CreditCard,
  Wallet,
  FolderTree,
  PlusCircle,
  Loader2,
} from "lucide-react";

function money(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function previousYm(ym) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function percentDelta(curr, prev) {
  if (!Number.isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}
function ymLabel(ym) {
  const [y, m] = String(ym || "").split("-");
  const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const idx = Math.max(1, Math.min(12, Number(m || 0))) - 1;
  return `${names[idx]} de ${y}`;
}
function fmtRelative(iso) {
  if (!iso) return "—";
  const when = new Date(String(iso).slice(0, 10));
  if (Number.isNaN(when.getTime())) return "—";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const w = new Date(when); w.setHours(0, 0, 0, 0);
  const diff = Math.round((today - w) / 86400000);
  if (diff === 0) return "hoje";
  if (diff === 1) return "ontem";
  if (diff > 1 && diff < 7) return `há ${diff} dias`;
  return when.toLocaleDateString("pt-BR");
}

export default function FinanceiroPreview() {
  const [ym] = useState(currentYm());
  const [kpis, setKpis] = useState({ recebido: 0, a_receber: 0, atrasado: 0 });
  const [prevKpis, setPrevKpis] = useState({ recebido: 0 });
  const [expenseKpis, setExpenseKpis] = useState({ total: 0, paid: 0, pending: 0, overdue: 0 });
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [revenues, setRevenues] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const prev = previousYm(ym);
        const [curr, prevK, pay, exp, rev, cats] = await Promise.all([
          financeGateway.getCombinedRevenueKpis({ ym }),
          financeGateway.getCombinedRevenueKpis({ ym: prev }),
          financeGateway.listPayments({ ym }),
          financeGateway.listExpenseEntries({ ym }),
          financeGateway.listOtherRevenues({ ym }),
          financeGateway.listExpenseCategories(),
        ]);
        if (cancelled) return;
        setKpis(curr || { recebido: 0, a_receber: 0, atrasado: 0 });
        setPrevKpis(prevK || { recebido: 0 });
        setPayments(Array.isArray(pay?.rows) ? pay.rows : []);
        setExpenses(Array.isArray(exp?.rows) ? exp.rows : []);
        setExpenseKpis(exp?.kpis || { total: 0, paid: 0, pending: 0, overdue: 0 });
        setRevenues(Array.isArray(rev) ? rev : Array.isArray(rev?.rows) ? rev.rows : []);
        setCategories(Array.isArray(cats) ? cats : []);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ym]);

  const recebido = Number(kpis?.recebido || 0);
  const aReceber = Number(kpis?.a_receber || 0);
  const atrasado = Number(kpis?.atrasado || 0);
  const gross = recebido + aReceber + atrasado;
  const net = recebido - Number(expenseKpis?.paid || 0);
  const prevRecebido = Number(prevKpis?.recebido || 0);
  const delta = percentDelta(recebido, prevRecebido);

  const paidPayments = payments.filter((p) => p.status === "paid");
  const overdueCount = payments.filter((p) => {
    const today = new Date().toISOString().slice(0, 10);
    return p.status === "pending" && p.due_date && String(p.due_date).slice(0, 10) < today;
  }).length;
  const paidPct = payments.length ? Math.round((paidPayments.length / payments.length) * 100) : 0;

  const sections = [
    {
      key: "mensalidades",
      label: "Mensalidades",
      desc: "Receita recorrente dos alunos",
      href: "/preview/financeiro/mensalidades",
      icon: CreditCard,
      count: loading ? "…" : `${payments.length} ${payments.length === 1 ? "lançamento" : "lançamentos"}`,
    },
    {
      key: "gastos",
      label: "Gastos",
      desc: "Despesas operacionais do mês",
      href: "/preview/gastos",
      icon: Wallet,
      count: loading ? "…" : `${expenses.length} este mês`,
    },
    {
      key: "outras-receitas",
      label: "Outras receitas",
      desc: "Taxas, materiais, eventos",
      href: "/preview/financeiro/outras-receitas",
      icon: Receipt,
      count: loading ? "…" : `${revenues.length} este mês`,
    },
    {
      key: "categorias",
      label: "Categorias",
      desc: "Gerenciar categorias contábeis",
      href: "/preview/financeiro/categorias",
      icon: FolderTree,
      count: loading ? "…" : `${categories.length} ${categories.length === 1 ? "categoria" : "categorias"}`,
    },
  ];

  const recent = useMemo(() => {
    const items = [];
    for (const p of paidPayments) {
      items.push({
        who: p.student_name || "Mensalidade",
        type: "mensalidade",
        amount: Number(p.amount || 0),
        kind: "in",
        when: p.paid_at || p.due_date,
        method: p.method || "—",
      });
    }
    for (const r of revenues) {
      if (r.status === "paid") {
        items.push({
          who: r.title || "Receita",
          type: "outra receita",
          amount: Number(r.amount || 0),
          kind: "in",
          when: r.paid_at || r.due_date,
          method: r.method || "—",
        });
      }
    }
    for (const e of expenses) {
      if (e.status === "paid") {
        items.push({
          who: e.title_snapshot || e.title || "Despesa",
          type: "gasto",
          amount: Number(e.amount || 0),
          kind: "out",
          when: e.paid_at || e.due_date,
          method: e.method || "—",
        });
      }
    }
    return items
      .filter((x) => x.when)
      .sort((a, b) => String(b.when).localeCompare(String(a.when)))
      .slice(0, 6);
  }, [paidPayments, expenses, revenues]);

  return (
    <PreviewShell
      active="financeiro"
      crumb="Gestão"
      title="Financeiro"
      rightAction={
        <button className="p-btn p-btn-primary hidden sm:inline-flex">
          <PlusCircle className="h-4 w-4" />
          <span>Novo lançamento</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Financeiro</h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${ymLabel(ym)} · ${paidPct}% recebido · ${overdueCount} em atraso`}
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
            Erro ao carregar financeiro: {error}
          </div>
        )}

        <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {[
            { label: "Receita bruta", value: money(gross), sub: delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1).replace(".", ",")}% vs. mês anterior` : "—", tone: "primary", icon: DollarSign },
            { label: "Recebido", value: money(recebido), sub: gross > 0 ? `${Math.round((recebido / gross) * 100)}% do total` : "—", tone: "success", icon: CheckCircle2 },
            { label: "Em atraso", value: money(atrasado), sub: `${overdueCount} ${overdueCount === 1 ? "pendência" : "pendências"}`, tone: "danger", icon: AlertCircle },
            { label: "Resultado do mês", value: money(net), sub: "líquido após gastos", tone: "accent", icon: TrendingUp },
          ].map(({ label, value, sub, tone, icon: Icon }) => (
            <div key={label} className="p-card p-card-hover flex flex-col gap-3 p-4 md:p-5">
              <div
                className={[
                  "grid h-9 w-9 place-items-center rounded-lg",
                  tone === "primary" ? "bg-[var(--p-primary-50)] text-[var(--p-primary)]" :
                  tone === "success" ? "bg-[var(--p-success-50)] text-[var(--p-success)]" :
                  tone === "danger"  ? "bg-[var(--p-danger-50)]  text-[var(--p-danger)]"  :
                                       "bg-[var(--p-surface-2)] text-[var(--p-accent)]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs text-[var(--p-text-muted)]">{label}</div>
                <div className="p-kpi-value mt-1 text-2xl md:text-[26px]">{loading ? "…" : value}</div>
                <div className="mt-0.5 text-xs text-[var(--p-text-faint)]">{sub}</div>
              </div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <div className="lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-[var(--p-text-muted)]">Áreas</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {sections.map((s) => {
                const Icon = s.icon;
                return (
                  <Link
                    key={s.key}
                    href={s.href}
                    className="p-card p-card-hover flex items-start gap-4 p-5"
                  >
                    <div className="grid h-11 w-11 place-items-center rounded-lg bg-[var(--p-primary-50)] text-[var(--p-primary)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{s.label}</div>
                        <ArrowUpRight className="h-4 w-4 text-[var(--p-text-faint)]" />
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--p-text-muted)]">{s.desc}</div>
                      <div className="mt-2 text-[11px] font-medium text-[var(--p-text-faint)]">{s.count}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="p-card">
            <div className="flex items-center justify-between border-b border-[var(--p-border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[var(--p-text-muted)]" />
                <h2 className="text-sm font-semibold">Últimos lançamentos</h2>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : recent.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-[var(--p-text-muted)]">
                Sem lançamentos pagos neste mês.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--p-border)]">
                {recent.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-3">
                    <div className={[
                      "grid h-8 w-8 place-items-center rounded-full text-xs",
                      r.kind === "in" ? "bg-[var(--p-success-50)] text-[var(--p-success)]" : "bg-[var(--p-danger-50)] text-[var(--p-danger)]",
                    ].join(" ")}>
                      {r.kind === "in" ? "+" : "−"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{r.who}</div>
                      <div className="text-[11px] text-[var(--p-text-muted)]">
                        {r.type} · {fmtRelative(r.when)}
                      </div>
                    </div>
                    <div className={[
                      "text-sm font-semibold tabular-nums",
                      r.kind === "in" ? "text-[var(--p-success)]" : "text-[var(--p-danger)]",
                    ].join(" ")}>
                      {r.kind === "in" ? "+" : "−"}{money(r.amount)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </PreviewShell>
  );
}

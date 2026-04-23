"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PreviewShell from "../_components/PreviewShell";
import PreviewModal, { FormError, ModalActions } from "../_components/PreviewModal";
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
  Plus,
  TrendingDown,
  Sparkles,
  Calendar,
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
  const [kpis, setKpis] = useState({ received: 0, upcoming: 0, overdue: 0 });
  const [prevKpis, setPrevKpis] = useState({ received: 0 });
  const [expenseKpis, setExpenseKpis] = useState({ total: 0, paid: 0, pending: 0, overdue: 0 });
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [revenues, setRevenues] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  async function load() {
    try {
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
      setKpis(curr || { received: 0, upcoming: 0, overdue: 0 });
      setPrevKpis(prevK || { received: 0 });
      setPayments(Array.isArray(pay?.rows) ? pay.rows : []);
      setExpenses(Array.isArray(exp?.rows) ? exp.rows : []);
      setExpenseKpis(exp?.kpis || { total: 0, paid: 0, pending: 0, overdue: 0 });
      setRevenues(Array.isArray(rev) ? rev : Array.isArray(rev?.rows) ? rev.rows : []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ym]);

  const recebido = Number(kpis?.received || 0);
  const aReceber = Number(kpis?.upcoming || 0);
  const atrasado = Number(kpis?.overdue || 0);
  const gross = Number(kpis?.total || recebido + aReceber + atrasado);
  const net = recebido - Number(expenseKpis?.paid || 0);
  const prevRecebido = Number(prevKpis?.received || 0);
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
        <div className="flex items-center gap-2">
          <button className="p-btn p-btn-ghost" onClick={() => setPreviewOpen(true)}>
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Prévia</span>
          </button>
          <button className="p-btn p-btn-primary" onClick={() => setModalOpen(true)}>
            <PlusCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Novo lançamento</span>
            <span className="sm:hidden">Novo</span>
          </button>
        </div>
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

      {modalOpen && (
        <NewLancamentoModal
          ym={ym}
          categories={categories}
          onClose={() => setModalOpen(false)}
          onCreated={async () => {
            setModalOpen(false);
            await load();
          }}
        />
      )}

      {previewOpen && (
        <PreviewMonthModal
          ym={ym}
          onClose={() => setPreviewOpen(false)}
          onGenerated={async () => {
            setPreviewOpen(false);
            await load();
          }}
        />
      )}
    </PreviewShell>
  );
}

function fmtBRDate(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 10).split("-").reverse().join("/");
}

function PreviewMonthModal({ ym, onClose, onGenerated }) {
  const [loading, setLoading] = useState(true);
  const [mensalidades, setMensalidades] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [err, setErr] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mens, exp, students] = await Promise.all([
          financeGateway.previewGenerateMonth({ ym }).catch(() => []),
          financeGateway.previewGenerateExpenses({ ym }).catch(() => []),
          financeGateway.listStudents().catch(() => []),
        ]);
        if (cancelled) return;
        const nameById = {};
        for (const s of students || []) nameById[s.id] = s.full_name || s.name || "";
        const mensEnriched = (Array.isArray(mens) ? mens : []).map((p) => ({
          ...p,
          _student: nameById[p.student_id] || p.student_name || "Aluno",
        }));
        setMensalidades(mensEnriched);
        setGastos(Array.isArray(exp) ? exp : []);
      } catch (e) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ym]);

  async function handleGenerate() {
    setErr(null);
    try {
      setGenerating(true);
      const tasks = [];
      if (mensalidades.length > 0) tasks.push(financeGateway.generateMonth({ ym }));
      if (gastos.length > 0) tasks.push(financeGateway.generateExpenses({ ym }));
      tasks.push(financeGateway.ensureOtherRevenuesForMonth(ym).catch(() => null));
      await Promise.all(tasks);
      await onGenerated();
    } catch (e) {
      setErr(e?.message || String(e));
      setGenerating(false);
    }
  }

  const totalMens = mensalidades.reduce((a, r) => a + Number(r.amount || 0), 0);
  const totalGastos = gastos.reduce((a, r) => a + Number(r.amount || 0), 0);
  const nothingToDo = !loading && mensalidades.length === 0 && gastos.length === 0;

  return (
    <PreviewModal title={`Prévia · ${ymLabel(ym)}`} onClose={generating ? () => {} : onClose} maxWidth="lg">
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="flex items-start gap-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-2)] px-3 py-2.5 text-xs text-[var(--p-text-muted)]">
          <Calendar className="h-4 w-4 shrink-0 text-[var(--p-text-muted)]" />
          <span>
            Gera mensalidades dos alunos ativos, despesas recorrentes e outras receitas
            recorrentes do mês. Itens já lançados não serão duplicados.
          </span>
        </div>

        <FormError message={err} />

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--p-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando prévia…
          </div>
        ) : nothingToDo ? (
          <div className="rounded-lg border border-dashed border-[var(--p-border)] px-4 py-8 text-center text-sm text-[var(--p-text-muted)]">
            Nada a gerar para este mês.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <PreviewSection
              title="Mensalidades"
              icon={CreditCard}
              tone="success"
              rows={mensalidades}
              total={totalMens}
              renderRow={(p) => ({
                label: p._student,
                sub: `venc. ${fmtBRDate(p.due_date)}`,
                amount: p.amount,
              })}
            />
            <PreviewSection
              title="Gastos recorrentes"
              icon={Wallet}
              tone="danger"
              rows={gastos}
              total={totalGastos}
              renderRow={(g) => ({
                label: g.title_snapshot || g.title || "—",
                sub: `venc. ${fmtBRDate(g.due_date)}`,
                amount: g.amount,
              })}
            />
            <div className="rounded-lg border border-dashed border-[var(--p-border)] px-3 py-2.5 text-xs text-[var(--p-text-muted)]">
              <Receipt className="mr-2 inline h-3.5 w-3.5" />
              Outras receitas recorrentes serão materializadas automaticamente ao gerar.
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="p-btn p-btn-ghost"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading || generating || nothingToDo}
            className="p-btn p-btn-primary"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Gerar
          </button>
        </div>
      </div>
    </PreviewModal>
  );
}

function PreviewSection({ title, icon: Icon, tone, rows, total, renderRow }) {
  if (!rows || rows.length === 0) return null;
  const toneCls =
    tone === "success" ? "text-[var(--p-success)]" :
    tone === "danger"  ? "text-[var(--p-danger)]"  : "text-[var(--p-text)]";
  const sign = tone === "danger" ? "−" : "+";
  return (
    <div className="rounded-lg border border-[var(--p-border)]">
      <div className="flex items-center justify-between border-b border-[var(--p-border)] bg-[var(--p-surface-2)] px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className={`h-4 w-4 ${toneCls}`} /> {title}
          <span className="text-xs font-normal text-[var(--p-text-muted)]">· {rows.length}</span>
        </div>
        <div className={`text-sm font-semibold tabular-nums ${toneCls}`}>{sign}{money(total)}</div>
      </div>
      <ul className="max-h-[200px] overflow-auto divide-y divide-[var(--p-border)]">
        {rows.map((r, i) => {
          const { label, sub, amount } = renderRow(r);
          return (
            <li key={i} className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{label}</div>
                <div className="text-[11px] text-[var(--p-text-faint)]">{sub}</div>
              </div>
              <div className={`text-sm font-semibold tabular-nums ${toneCls}`}>
                {sign}{money(amount)}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NewLancamentoModal({ ym, categories, onClose, onCreated }) {
  const [kind, setKind] = useState("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    const t = title.trim();
    const a = Number(amount);
    if (!t) { setErr("Título é obrigatório"); return; }
    if (!Number.isFinite(a) || a <= 0) { setErr("Valor deve ser maior que zero"); return; }
    if (!date) { setErr("Data é obrigatória"); return; }
    try {
      setSaving(true);
      if (kind === "expense") {
        await financeGateway.createOneOffExpense({
          date,
          amount: a,
          title: t,
          category: category || null,
          cost_center: "PJ",
        });
      } else {
        await financeGateway.createOtherRevenue({
          ym,
          title: t,
          amount: a,
          due_date: date,
          category: category || null,
          cost_center: "extra",
        });
      }
      await onCreated();
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PreviewModal title="Novo lançamento" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />

        <div className="inline-flex rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] p-1 text-sm self-start">
          <button
            type="button"
            onClick={() => setKind("expense")}
            className={[
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
              kind === "expense"
                ? "bg-[var(--p-danger)] text-white"
                : "text-[var(--p-text-muted)] hover:text-[var(--p-text)]",
            ].join(" ")}
          >
            <TrendingDown className="h-3.5 w-3.5" /> Despesa
          </button>
          <button
            type="button"
            onClick={() => setKind("revenue")}
            className={[
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors",
              kind === "revenue"
                ? "bg-[var(--p-success)] text-white"
                : "text-[var(--p-text-muted)] hover:text-[var(--p-text)]",
            ].join(" ")}
          >
            <TrendingUp className="h-3.5 w-3.5" /> Receita
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">Título *</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "expense" ? "Ex.: Conta de luz" : "Ex.: Taxa de matrícula"}
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">Valor (R$) *</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">
              {kind === "expense" ? "Data *" : "Vencimento *"}
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">Categoria</span>
          {kind === "expense" ? (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id || c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          ) : (
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex.: Matrícula"
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          )}
        </label>

        <ModalActions onCancel={onClose} submitting={saving} submitLabel="Cadastrar" submitIcon={saving ? Loader2 : Plus} />
      </form>
    </PreviewModal>
  );
}

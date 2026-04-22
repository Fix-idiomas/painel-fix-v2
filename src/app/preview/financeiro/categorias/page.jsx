"use client";

import { useEffect, useMemo, useState } from "react";
import PreviewShell from "../../_components/PreviewShell";
import PreviewModal, { FormError, ModalActions, ConfirmDeleteModal } from "../../_components/PreviewModal";
import { financeGateway } from "@/lib/financeGateway";
import {
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Loader2,
} from "lucide-react";

function money(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CategoriasPreview() {
  const [tab, setTab] = useState("all");
  const [expenseCats, setExpenseCats] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [revenues, setRevenues] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  async function load() {
    try {
      setError(null);
      const ym = currentYm();
      const [cats, exp, rev, pay] = await Promise.all([
        financeGateway.listExpenseCategories(),
        financeGateway.listExpenseEntries({ ym }),
        financeGateway.listOtherRevenues({ ym }),
        financeGateway.listPayments({ ym }),
      ]);
      setExpenseCats(Array.isArray(cats) ? cats : []);
      setExpenses(Array.isArray(exp?.rows) ? exp.rows : []);
      setRevenues(Array.isArray(rev) ? rev : Array.isArray(rev?.rows) ? rev.rows : []);
      setPayments(Array.isArray(pay?.rows) ? pay.rows : []);
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
  }, []);

  const categories = useMemo(() => {
    const out = [];
    // Expenses: from listExpenseCategories, with rollup from entries
    const expCountByCat = new Map();
    const expSumByCat = new Map();
    for (const e of expenses) {
      const cat = e.category || "Sem categoria";
      expCountByCat.set(cat, (expCountByCat.get(cat) || 0) + 1);
      expSumByCat.set(cat, (expSumByCat.get(cat) || 0) + Number(e.amount || 0));
    }
    const seenExp = new Set();
    for (const c of expenseCats) {
      const name = c.name || "—";
      seenExp.add(name);
      out.push({
        id: c.id || `exp-${name}`,
        name,
        type: "expense",
        count: expCountByCat.get(name) || 0,
        total: expSumByCat.get(name) || 0,
        active: c.active !== false,
      });
    }
    // Add any expense categories used in entries but not in the registry
    for (const [name, count] of expCountByCat.entries()) {
      if (!seenExp.has(name)) {
        out.push({
          id: `exp-${name}`,
          name,
          type: "expense",
          count,
          total: expSumByCat.get(name) || 0,
          active: true,
        });
      }
    }

    // Revenues: derived from other_revenues by category, + "Mensalidades" aggregated
    const revCountByCat = new Map();
    const revSumByCat = new Map();
    for (const r of revenues) {
      const cat = r.category || "Sem categoria";
      revCountByCat.set(cat, (revCountByCat.get(cat) || 0) + 1);
      revSumByCat.set(cat, (revSumByCat.get(cat) || 0) + Number(r.amount || 0));
    }
    for (const [name, count] of revCountByCat.entries()) {
      out.push({
        id: `rev-${name}`,
        name,
        type: "revenue",
        count,
        total: revSumByCat.get(name) || 0,
        active: true,
      });
    }
    if (payments.length > 0) {
      out.push({
        id: "rev-mensalidades",
        name: "Mensalidades",
        type: "revenue",
        count: payments.length,
        total: payments.reduce((a, p) => a + Number(p.amount || 0), 0),
        active: true,
      });
    }

    return out.sort((a, b) => b.total - a.total);
  }, [expenseCats, expenses, revenues, payments]);

  const visible = categories.filter((c) => tab === "all" || c.type === tab);
  const totalExp = categories.filter((c) => c.type === "expense").reduce((a, c) => a + c.total, 0);
  const totalRev = categories.filter((c) => c.type === "revenue").reduce((a, c) => a + c.total, 0);
  const countRev = categories.filter((c) => c.type === "revenue").length;
  const countExp = categories.filter((c) => c.type === "expense").length;

  return (
    <PreviewShell
      active="financeiro"
      crumb="Financeiro"
      title="Categorias"
      rightAction={
        <button className="p-btn p-btn-primary" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova categoria</span>
          <span className="sm:hidden">Nova</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Categorias</h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${categories.length} categorias · ${countRev} de receita · ${countExp} de despesa`}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
            Erro ao carregar categorias: {error}
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 md:gap-4">
          <div className="p-card p-5">
            <div className="flex items-center gap-2 text-xs text-[var(--p-text-muted)]">
              <TrendingUp className="h-3.5 w-3.5 text-[var(--p-success)]" /> Receitas totais
            </div>
            <div className="p-kpi-value mt-1 text-2xl text-[var(--p-success)]">
              {loading ? "…" : `+${money(totalRev)}`}
            </div>
          </div>
          <div className="p-card p-5">
            <div className="flex items-center gap-2 text-xs text-[var(--p-text-muted)]">
              <TrendingDown className="h-3.5 w-3.5 text-[var(--p-danger)]" /> Despesas totais
            </div>
            <div className="p-kpi-value mt-1 text-2xl text-[var(--p-danger)]">
              {loading ? "…" : `−${money(totalExp)}`}
            </div>
          </div>
        </div>

        <div className="mb-4 inline-flex rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] p-1 text-sm">
          {[
            { k: "all", l: "Todas" },
            { k: "revenue", l: "Receitas" },
            { k: "expense", l: "Despesas" },
          ].map((t) => {
            const active = tab === t.k;
            return (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={[
                  "rounded-md px-3 py-1.5 transition-colors",
                  active ? "bg-[var(--p-primary)] text-white" : "text-[var(--p-text-muted)] hover:text-[var(--p-text)]",
                ].join(" ")}
              >
                {t.l}
              </button>
            );
          })}
        </div>

        <div className="p-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : visible.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-[var(--p-text-muted)]">
              Nenhuma categoria neste filtro.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--p-border)]">
              {visible.map((c) => {
                const isRev = c.type === "revenue";
                return (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--p-surface-2)]">
                    <div className={[
                      "grid h-9 w-9 place-items-center rounded-lg",
                      isRev ? "bg-[var(--p-success-50)] text-[var(--p-success)]" : "bg-[var(--p-danger-50)] text-[var(--p-danger)]",
                    ].join(" ")}>
                      {isRev ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium truncate">{c.name}</div>
                        <span className="p-chip p-chip-neutral">{isRev ? "Receita" : "Despesa"}</span>
                        {c.active === false && <span className="p-chip p-chip-neutral">Inativa</span>}
                      </div>
                      <div className="text-xs text-[var(--p-text-muted)]">
                        {c.count} {c.count === 1 ? "lançamento" : "lançamentos"} · mês atual
                      </div>
                    </div>
                    <div className={["text-sm font-semibold tabular-nums", isRev ? "text-[var(--p-success)]" : "text-[var(--p-danger)]"].join(" ")}>
                      {c.count > 0 ? (isRev ? "+" : "−") + money(c.total) : "—"}
                    </div>
                    {c.type === "expense" && !String(c.id).startsWith("exp-") && (
                      <button
                        onClick={() => setToDelete(c)}
                        className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-danger)]"
                        aria-label="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {modalOpen && (
        <NewCategoryModal
          onClose={() => setModalOpen(false)}
          onCreated={async () => {
            setModalOpen(false);
            await load();
          }}
        />
      )}

      {toDelete && (
        <ConfirmDeleteModal
          title="Remover categoria"
          itemName={toDelete.name}
          description="Lançamentos já existentes mantêm o nome da categoria como texto, mas ela não aparecerá mais ao criar novos."
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await financeGateway.deleteExpenseCategory(toDelete.id);
            setToDelete(null);
            await load();
          }}
        />
      )}
    </PreviewShell>
  );
}

function NewCategoryModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    const trimmed = name.trim();
    if (!trimmed) { setErr("Nome é obrigatório"); return; }
    try {
      setSaving(true);
      await financeGateway.createExpenseCategory({ name: trimmed, active: true });
      await onCreated();
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PreviewModal title="Nova categoria" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">Nome *</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Marketing"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <p className="text-[11px] text-[var(--p-text-faint)]">Categorias são usadas para classificar gastos.</p>
        <ModalActions onCancel={onClose} submitting={saving} submitLabel="Cadastrar" submitIcon={saving ? Loader2 : Plus} />
      </form>
    </PreviewModal>
  );
}

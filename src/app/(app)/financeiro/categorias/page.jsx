"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/contexts/SessionContext";
import { financeGateway } from "@/lib/financeGateway";
import {
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Loader2,
} from "lucide-react";
import AppModal, {
  FormError,
  ModalActions,
  ConfirmDeleteModal,
} from "@/components/AppModal";

function money(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CategoriasPage() {
  const sess = useSession();
  const ready = sess?.ready ?? true;

  // Permissões
  const [permChecked, setPermChecked] = useState(false);
  const [canReadDB, setCanReadDB] = useState(false);
  const [canWriteDB, setCanWriteDB] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      try {
        const { supabase } = await import("@/lib/supabaseClient");
        const { data: tenantId, error: tErr } = await supabase.rpc(
          "current_tenant_id"
        );
        if (tErr) throw tErr;
        const [rRead, rWrite] = await Promise.all([
          supabase.rpc("is_admin_or_finance_read", { p_tenant: tenantId }),
          supabase.rpc("is_admin_or_finance_write", { p_tenant: tenantId }),
        ]);
        if (!alive) return;
        if (rRead.error) throw rRead.error;
        if (rWrite.error) throw rWrite.error;
        setCanReadDB(!!rRead.data);
        setCanWriteDB(!!rWrite.data);
      } catch (e) {
        console.warn("perm check (categorias) failed:", e);
        setCanReadDB(false);
        setCanWriteDB(false);
      } finally {
        if (alive) setPermChecked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready, sess?.user?.id]);

  // Estado
  const [tab, setTab] = useState("all");
  const [expenseCats, setExpenseCats] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [revenues, setRevenues] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editTarget, setEditTarget] = useState(undefined); // null = novo, obj = edit, undefined = fechado
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
      setRevenues(
        Array.isArray(rev)
          ? rev
          : Array.isArray(rev?.rows)
          ? rev.rows
          : []
      );
      setPayments(Array.isArray(pay?.rows) ? pay.rows : []);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    if (!permChecked || !canReadDB) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [permChecked, canReadDB]);

  const categories = useMemo(() => {
    const out = [];

    // Despesas: cadastro + rollup do mês
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
        registryId: c.id || null, // só editável se vier do cadastro
        raw: c,
        name,
        type: "expense",
        count: expCountByCat.get(name) || 0,
        total: expSumByCat.get(name) || 0,
        active: c.active !== false,
      });
    }
    // Categorias usadas mas não cadastradas (free-text)
    for (const [name, count] of expCountByCat.entries()) {
      if (!seenExp.has(name)) {
        out.push({
          id: `exp-${name}`,
          registryId: null,
          raw: null,
          name,
          type: "expense",
          count,
          total: expSumByCat.get(name) || 0,
          active: true,
          isFreeText: true,
        });
      }
    }

    // Receitas: derivado de other_revenues por categoria + Mensalidades agregadas
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
        registryId: null,
        raw: null,
        name,
        type: "revenue",
        count,
        total: revSumByCat.get(name) || 0,
        active: true,
        isFreeText: true,
      });
    }
    if (payments.length > 0) {
      out.push({
        id: "rev-mensalidades",
        registryId: null,
        raw: null,
        name: "Mensalidades",
        type: "revenue",
        count: payments.length,
        total: payments.reduce((a, p) => a + Number(p.amount || 0), 0),
        active: true,
        isAggregated: true,
      });
    }

    return out.sort((a, b) => b.total - a.total);
  }, [expenseCats, expenses, revenues, payments]);

  const visible = categories.filter(
    (c) => tab === "all" || c.type === tab
  );
  const countRev = categories.filter((c) => c.type === "revenue").length;
  const countExp = categories.filter((c) => c.type === "expense").length;

  // Gates
  if (!permChecked) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--p-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  if (!canReadDB) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-xl font-semibold">Acesso negado</h1>
        <p className="text-sm text-[var(--p-text-muted)]">
          Você não tem permissão para visualizar o Financeiro desta escola.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Categorias
          </h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${categories.length} categorias · ${countRev} de receita · ${countExp} de despesa · mês atual`}
          </p>
        </div>
        {canWriteDB && (
          <button
            onClick={() => setEditTarget(null)}
            className="p-btn p-btn-primary self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            <span>Nova categoria</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          Erro ao carregar categorias: {error}
        </div>
      )}

      {/* Tabs */}
      <div className="inline-flex rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] p-1 text-sm">
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
                active
                  ? "bg-[var(--p-primary)] text-white"
                  : "text-[var(--p-text-muted)] hover:text-[var(--p-text)]",
              ].join(" ")}
            >
              {t.l}
            </button>
          );
        })}
      </div>

      {/* Lista */}
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
              const isEditable = c.type === "expense" && !!c.registryId;
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--p-surface-2)]"
                >
                  <div
                    className={[
                      "grid h-9 w-9 place-items-center rounded-lg",
                      isRev
                        ? "bg-[var(--p-success-50)] text-[var(--p-success)]"
                        : "bg-[var(--p-danger-50)] text-[var(--p-danger)]",
                    ].join(" ")}
                  >
                    {isRev ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium truncate">{c.name}</div>
                      <span className="p-chip p-chip-neutral">
                        {isRev ? "Receita" : "Despesa"}
                      </span>
                      {c.active === false && (
                        <span className="p-chip p-chip-warning">Inativa</span>
                      )}
                      {c.isFreeText && (
                        <span
                          className="text-[10px] uppercase tracking-wider text-[var(--p-text-faint)]"
                          title="Categoria usada em lançamentos sem estar cadastrada"
                        >
                          texto livre
                        </span>
                      )}
                      {c.isAggregated && (
                        <span className="text-[10px] uppercase tracking-wider text-[var(--p-text-faint)]">
                          agregado
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--p-text-muted)]">
                      {c.count}{" "}
                      {c.count === 1 ? "lançamento" : "lançamentos"} · mês atual
                    </div>
                  </div>
                  <div
                    className={[
                      "text-sm font-semibold tabular-nums",
                      isRev
                        ? "text-[var(--p-success)]"
                        : "text-[var(--p-danger)]",
                    ].join(" ")}
                  >
                    {c.count > 0
                      ? (isRev ? "+" : "−") + money(c.total)
                      : "—"}
                  </div>
                  {canWriteDB && isEditable && (
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => setEditTarget(c.raw)}
                        className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                        aria-label="Editar"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setToDelete(c)}
                        className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)]"
                        aria-label="Remover"
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-[var(--p-text-muted)]">
        Categorias são usadas para classificar gastos. Você pode digitar uma
        categoria livre direto no formulário de lançamento; ela aparecerá
        aqui marcada como "texto livre".
      </p>

      {/* Modais */}
      {editTarget !== undefined && canWriteDB && (
        <CategoryFormModal
          initial={editTarget}
          onClose={() => setEditTarget(undefined)}
          onSaved={async () => {
            setEditTarget(undefined);
            await load();
          }}
        />
      )}

      {toDelete && canWriteDB && (
        <ConfirmDeleteModal
          title="Remover categoria"
          itemName={toDelete.name}
          description="Lançamentos já existentes mantêm o nome da categoria como texto, mas ela não aparecerá mais ao criar novos."
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await financeGateway.deleteExpenseCategory(toDelete.registryId);
            setToDelete(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ─── Modal: Criar/Editar categoria ───────────────────────────────
function CategoryFormModal({ initial, onClose, onSaved }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [active, setActive] = useState(initial ? !!initial.active : true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Nome é obrigatório");
      return;
    }
    try {
      setSaving(true);
      if (isEdit) {
        await financeGateway.updateExpenseCategory(initial.id, {
          name: trimmed,
          active,
        });
      } else {
        await financeGateway.createExpenseCategory({
          name: trimmed,
          active: true,
        });
      }
      await onSaved();
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      title={isEdit ? "Editar categoria" : "Nova categoria"}
      onClose={saving ? () => {} : onClose}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Nome *
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Marketing"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        {isEdit && (
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Ativa (aparece nos formulários de lançamento)
          </label>
        )}
        <p className="text-[11px] text-[var(--p-text-faint)]">
          Categorias são usadas para classificar gastos.
        </p>
        <ModalActions
          onCancel={onClose}
          submitting={saving}
          submitLabel={isEdit ? "Salvar" : "Cadastrar"}
        />
      </form>
    </AppModal>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "@/contexts/SessionContext";
import { financeGateway } from "@/lib/financeGateway";
import {
  Search,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2,
  Pencil,
  XCircle,
  RotateCcw,
  Calendar,
  Repeat,
  Sparkles,
  Loader2,
} from "lucide-react";
import AppModal, {
  FormError,
  ModalActions,
  ConfirmDeleteModal,
} from "@/components/AppModal";

// ─── Helpers ──────────────────────────────────────────────────────
const STATUS_LABELS = {
  pending: "Pendente",
  paid: "Pago",
  canceled: "Cancelado",
};

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const fmtBR = (s) => {
  if (!s) return "-";
  const [y, m, d] = String(s).slice(0, 10).split("-");
  if (!y || !m || !d) return "-";
  return `${d}/${m}/${y}`;
};

const ymLabel = (ym) => {
  const [y, m] = String(ym || "").split("-");
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const idx = Math.max(1, Math.min(12, Number(m || 0))) - 1;
  return `${names[idx]} de ${y}`;
};

function statusChip(row) {
  const today = new Date().toISOString().slice(0, 10);
  if (row.status === "paid")
    return { cls: "p-chip-success", icon: CheckCircle2, label: "Pago" };
  if (row.status === "canceled")
    return { cls: "p-chip-neutral", icon: Clock, label: "Cancelado" };
  if (row.status === "pending" && row.due_date && row.due_date < today) {
    return {
      cls: "p-chip-danger",
      icon: AlertCircle,
      label: `Atraso ${row.days_overdue || 0}d`,
    };
  }
  return { cls: "p-chip-warning", icon: Clock, label: "Pendente" };
}

// Helpers para detecção de duplicatas
const normalizeTitle = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const clampDay = (n) => Math.min(Math.max(Number(n || 5), 1), 28);

const shapeKey = (freq, day, month, cc) =>
  `${cc || "PJ"}|${String(freq || "monthly")}|${clampDay(day)}|${
    String(freq) === "annual" ? Number(month || 0) : 0
  }`;

// ─── Página ───────────────────────────────────────────────────────
export default function GastosPage() {
  const sess = useSession();
  const ready = sess?.ready ?? true;

  // Permissões (DB é fonte da verdade)
  const [permChecked, setPermChecked] = useState(false);
  const [canReadDB, setCanReadDB] = useState(false);
  const [canWriteDB, setCanWriteDB] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      try {
        const { supabase } = await import("@/lib/supabaseClient");
        const { data: tenantId, error: tErr } = await supabase.rpc("current_tenant_id");
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
        console.warn("perm check failed:", e);
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
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7));
  const [statusFilter, setStatusFilter] = useState("all");
  const [costCenter, setCostCenter] = useState("all");
  const [q, setQ] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

  const [rows, setRows] = useState([]);
  const [kpis, setKpis] = useState({ total: 0, paid: 0, pending: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [templates, setTemplates] = useState([]);
  const [tplSearch, setTplSearch] = useState("");
  const [categories, setCategories] = useState([]);

  // Modais
  const [tplFormTarget, setTplFormTarget] = useState(undefined); // null = novo, obj = edit, undefined = fechado
  const [avulsoOpen, setAvulsoOpen] = useState(false);
  const [previewModal, setPreviewModal] = useState(null); // { items, generating }
  const [toDeleteEntry, setToDeleteEntry] = useState(null);
  const [toDeleteTpl, setToDeleteTpl] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  // Carregar lançamentos
  async function load() {
    try {
      setError(null);
      const { rows: rs, kpis: k } = await financeGateway.listExpenseEntries({
        ym,
        status: statusFilter === "all" ? null : statusFilter,
        cost_center: costCenter === "all" ? null : costCenter,
      });
      setRows(rs);
      setKpis(k);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permChecked, canReadDB, ym, statusFilter, costCenter]);

  async function loadTemplates() {
    const list = await financeGateway.listExpenseTemplates();
    setTemplates(list);
  }

  useEffect(() => {
    if (!permChecked || !canWriteDB) return;
    loadTemplates();
  }, [permChecked, canWriteDB]);

  useEffect(() => {
    if (!permChecked || !canReadDB) return;
    (async () => {
      try {
        const list = await financeGateway.listExpenseCategories();
        setCategories(Array.isArray(list) ? list : []);
      } catch {
        setCategories([]);
      }
    })();
  }, [permChecked, canReadDB]);

  // Limpa UI se perder write
  useEffect(() => {
    if (!canWriteDB) {
      setTemplates([]);
      setTplFormTarget(undefined);
      setAvulsoOpen(false);
    }
  }, [canWriteDB]);

  // Filtragem cliente (busca)
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const s =
        String(r.title_snapshot || "").toLowerCase() +
        " " +
        String(r.category || "").toLowerCase();
      return s.includes(term);
    });
  }, [rows, q]);

  const filteredTemplates = useMemo(() => {
    const t = normalizeTitle(tplSearch);
    if (!t) return templates;
    return (templates || []).filter((x) => {
      const hay = [x.title, x.category, x.cost_center].map((v) =>
        normalizeTitle(v || "")
      );
      return hay.some((h) => h.includes(t));
    });
  }, [templates, tplSearch]);

  // Ações
  async function markPaid(id) {
    if (!canWriteDB) return;
    try {
      setUpdatingId(id);
      setError(null);
      await financeGateway.markExpensePaid(id);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setUpdatingId(null);
    }
  }

  async function reopen(id) {
    if (!canWriteDB) return;
    try {
      setUpdatingId(id);
      setError(null);
      await financeGateway.reopenExpense(id);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setUpdatingId(null);
    }
  }

  async function doCancel(id) {
    try {
      setUpdatingId(id);
      setError(null);
      await financeGateway.cancelExpense(id);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setUpdatingId(null);
    }
  }

  async function onPreviewGenerate() {
    if (!canWriteDB) return;
    try {
      const items = await financeGateway.previewGenerateExpenses({ ym });
      if (!items || items.length === 0) {
        alert("Nada a gerar para este mês.");
        return;
      }
      setPreviewModal({ items, generating: false });
    } catch (e) {
      alert(e?.message || String(e));
    }
  }

  async function confirmGenerate() {
    if (!previewModal || !canWriteDB) return;
    try {
      setPreviewModal((p) => ({ ...p, generating: true }));
      await financeGateway.generateExpenses({ ym });
      setPreviewModal(null);
      await load();
    } catch (e) {
      alert(e?.message || String(e));
      setPreviewModal((p) => p && { ...p, generating: false });
    }
  }

  async function deleteTemplate(t) {
    await financeGateway.deleteExpenseTemplate(t.id);
    await loadTemplates();
  }

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
      <div className="space-y-3 p-6">
        <h1 className="text-xl font-semibold">Acesso negado</h1>
        <p className="text-sm text-[var(--p-text-muted)]">
          Você não tem permissão para visualizar o Financeiro desta escola.
        </p>
      </div>
    );
  }

  const totalPending = kpis.total - kpis.paid - kpis.overdue;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Gastos
          </h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${ymLabel(ym)} · ${rows.length} lançamentos`}
          </p>
        </div>
        {canWriteDB && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onPreviewGenerate}
              className="p-btn p-btn-ghost"
              title="Mostra a prévia e gera os lançamentos recorrentes do mês"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Prévia & gerar</span>
            </button>
            <button onClick={() => setAvulsoOpen(true)} className="p-btn p-btn-ghost">
              <Plus className="h-4 w-4" />
              <span>Avulso</span>
            </button>
            <button onClick={() => setTplFormTarget(null)} className="p-btn p-btn-primary">
              <Repeat className="h-4 w-4" />
              <span className="hidden sm:inline">Nova recorrente</span>
              <span className="sm:hidden">Recorrente</span>
            </button>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <SumCard label="Total do mês" value={fmtBRL(kpis.total)} />
        <SumCard label="Pagos" value={fmtBRL(kpis.paid)} tone="success" />
        <SumCard label="Pendentes" value={fmtBRL(totalPending)} tone="warning" />
        <SumCard label="Em atraso" value={fmtBRL(kpis.overdue)} tone="danger" />
      </div>

      {/* Filtros: busca + mês + cost center + status */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--p-text-faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar descrição ou categoria…"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--p-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm">
          <Calendar className="h-4 w-4 text-[var(--p-text-muted)]" />
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value.slice(0, 7))}
            className="bg-transparent text-sm focus:outline-none"
          />
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Filter status pills */}
          <div className="flex gap-1 min-w-max">
            {[
              { key: "all", label: "Todos" },
              { key: "pending", label: "Pendentes" },
              { key: "paid", label: "Pagos" },
              { key: "canceled", label: "Cancelados" },
            ].map((f) => {
              const active = statusFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-[var(--p-primary)] text-white"
                      : "bg-[var(--p-surface)] border border-[var(--p-border)] text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]",
                  ].join(" ")}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="h-6 w-px bg-[var(--p-border)] hidden sm:block" />
          {/* Cost center pills (PF/PJ) — diferencial Fix */}
          <div className="flex gap-1 min-w-max">
            {[
              { key: "all", label: "Todos centros" },
              { key: "PJ", label: "PJ" },
              { key: "PF", label: "PF" },
            ].map((f) => {
              const active = costCenter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setCostCenter(f.key)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-xs transition-colors",
                    active
                      ? "bg-[var(--p-text)] text-white"
                      : "bg-[var(--p-surface)] border border-[var(--p-border)] text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]",
                  ].join(" ")}
                  title={
                    f.key === "PJ"
                      ? "Pessoa Jurídica (escola)"
                      : f.key === "PF"
                      ? "Pessoa Física (pessoal)"
                      : "Todos os centros"
                  }
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          Erro: {error}
        </div>
      )}

      {/* Lançamentos */}
      <div className="p-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-[var(--p-text-muted)]">
            Nenhum gasto neste filtro.
          </div>
        ) : (
          <>
            {/* Tabela desktop */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--p-border)] bg-[var(--p-surface-2)] text-left text-xs font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                    <th className="px-5 py-3">Vencimento</th>
                    <th className="px-5 py-3">Descrição</th>
                    <th className="px-5 py-3">Categoria</th>
                    <th className="px-5 py-3">Centro</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Valor</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--p-border)]">
                  {filtered.map((r) => {
                    const { cls, icon: Icon, label } = statusChip(r);
                    return (
                      <tr key={r.id} className="hover:bg-[var(--p-surface-2)]">
                        <td className="px-5 py-3 tabular-nums text-[var(--p-text-muted)]">
                          {fmtBR(r.due_date)}
                        </td>
                        <td className="px-5 py-3 font-medium">
                          {r.title_snapshot || "—"}
                        </td>
                        <td className="px-5 py-3">
                          {r.category ? (
                            <span className="p-chip p-chip-neutral">
                              {r.category}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--p-text-faint)]">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs font-medium text-[var(--p-text-muted)]">
                            {r.cost_center || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`p-chip ${cls}`}>
                            <Icon className="h-3 w-3" /> {label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums text-[var(--p-danger)]">
                          −{fmtBRL(r.amount)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {canWriteDB && (
                            <RowActions
                              entry={r}
                              busy={updatingId === r.id}
                              onMarkPaid={() => markPaid(r.id)}
                              onReopen={() => reopen(r.id)}
                              onCancel={() => setCancelTarget(r)}
                              onDelete={() => setToDeleteEntry(r)}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Lista mobile */}
            <ul className="divide-y divide-[var(--p-border)] md:hidden">
              {filtered.map((r) => {
                const { cls, icon: Icon, label } = statusChip(r);
                return (
                  <li key={r.id} className="flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {r.title_snapshot || "—"}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--p-text-muted)]">
                          <span>{fmtBR(r.due_date)}</span>
                          {r.category && (
                            <span className="p-chip p-chip-neutral">
                              {r.category}
                            </span>
                          )}
                          {r.cost_center && (
                            <span className="rounded bg-[var(--p-surface-2)] px-1.5 py-0.5 font-medium">
                              {r.cost_center}
                            </span>
                          )}
                          <span className={`p-chip ${cls}`}>
                            <Icon className="h-3 w-3" /> {label}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold tabular-nums text-[var(--p-danger)]">
                          −{fmtBRL(r.amount)}
                        </div>
                      </div>
                    </div>
                    {canWriteDB && (
                      <div className="flex">
                        <RowActions
                          entry={r}
                          busy={updatingId === r.id}
                          onMarkPaid={() => markPaid(r.id)}
                          onReopen={() => reopen(r.id)}
                          onCancel={() => setCancelTarget(r)}
                          onDelete={() => setToDeleteEntry(r)}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Recorrentes */}
      {canWriteDB && (
        <div className="p-card overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[var(--p-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-[var(--p-text-muted)]" />
              <h2 className="text-sm font-semibold">Despesas recorrentes</h2>
              <span className="text-xs text-[var(--p-text-faint)]">
                {filteredTemplates.length}
                {templates?.length ? ` / ${templates.length}` : ""}
              </span>
            </div>
            <input
              value={tplSearch}
              onChange={(e) => setTplSearch(e.target.value)}
              placeholder="Buscar…"
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-1.5 text-sm placeholder:text-[var(--p-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40 sm:w-72"
            />
          </div>

          {(templates?.length || 0) === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[var(--p-text-muted)]">
              Nenhuma recorrente cadastrada.
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--p-border)] bg-[var(--p-surface-2)] text-left text-xs font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                      <th className="px-5 py-3">Título</th>
                      <th className="px-5 py-3">Categoria</th>
                      <th className="px-5 py-3">Centro</th>
                      <th className="px-5 py-3">Frequência</th>
                      <th className="px-5 py-3">Vencimento</th>
                      <th className="px-5 py-3 text-right">Valor</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--p-border)]">
                    {filteredTemplates.map((t) => (
                      <tr
                        key={t.id}
                        className="hover:bg-[var(--p-surface-2)]"
                      >
                        <td className="px-5 py-3 font-medium">{t.title}</td>
                        <td className="px-5 py-3">
                          {t.category ? (
                            <span className="p-chip p-chip-neutral">
                              {t.category}
                            </span>
                          ) : (
                            <span className="text-xs text-[var(--p-text-faint)]">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-xs font-medium text-[var(--p-text-muted)]">
                          {t.cost_center || "—"}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          {t.frequency === "annual" ? "Anual" : "Mensal"}
                        </td>
                        <td className="px-5 py-3 text-xs whitespace-nowrap">
                          {t.frequency === "annual"
                            ? `Mês ${t.due_month} · Dia ${t.due_day}`
                            : `Dia ${t.due_day}`}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums">
                          {fmtBRL(t.amount)}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`p-chip ${
                              t.active ? "p-chip-success" : "p-chip-neutral"
                            }`}
                          >
                            {t.active ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => setTplFormTarget(t)}
                              className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                              aria-label="Editar"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setToDeleteTpl(t)}
                              className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)]"
                              aria-label="Remover"
                              title="Remover"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-[var(--p-border)] md:hidden">
                {filteredTemplates.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-col gap-2 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{t.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--p-text-muted)]">
                          {t.category && (
                            <span className="p-chip p-chip-neutral">
                              {t.category}
                            </span>
                          )}
                          {t.cost_center && (
                            <span className="rounded bg-[var(--p-surface-2)] px-1.5 py-0.5 font-medium">
                              {t.cost_center}
                            </span>
                          )}
                          <span>
                            {t.frequency === "annual"
                              ? `Anual · mês ${t.due_month}`
                              : `Mensal · dia ${t.due_day}`}
                          </span>
                          <span
                            className={`p-chip ${
                              t.active ? "p-chip-success" : "p-chip-neutral"
                            }`}
                          >
                            {t.active ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold tabular-nums">
                          {fmtBRL(t.amount)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setTplFormTarget(t)}
                        className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setToDeleteTpl(t)}
                        className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)]"
                        aria-label="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Modais */}
      {tplFormTarget !== undefined && (
        <TemplateFormModal
          initial={tplFormTarget}
          categories={categories}
          templates={templates}
          onClose={() => setTplFormTarget(undefined)}
          onSaved={async () => {
            setTplFormTarget(undefined);
            await loadTemplates();
          }}
        />
      )}

      {avulsoOpen && (
        <AvulsoModal
          ym={ym}
          categories={categories}
          onClose={() => setAvulsoOpen(false)}
          onSaved={async () => {
            setAvulsoOpen(false);
            await load();
          }}
        />
      )}

      {previewModal && (
        <AppModal
          title={`Prévia · ${ymLabel(ym)}`}
          onClose={previewModal.generating ? () => {} : () => setPreviewModal(null)}
          maxWidth="lg"
        >
          <div className="flex flex-col gap-4 px-5 py-5">
            <p className="text-sm text-[var(--p-text-muted)]">
              Os seguintes lançamentos serão gerados a partir das recorrentes
              ativas:
            </p>
            <ul className="max-h-72 overflow-y-auto rounded-lg border border-[var(--p-border)] divide-y divide-[var(--p-border)]">
              {previewModal.items.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.title_snapshot}</div>
                    <div className="text-xs text-[var(--p-text-muted)]">
                      Vence {fmtBR(p.due_date)} · {p.cost_center}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-[var(--p-danger)]">
                    −{fmtBRL(p.amount)}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                disabled={previewModal.generating}
                className="p-btn p-btn-ghost"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmGenerate}
                disabled={previewModal.generating}
                className="p-btn p-btn-primary"
              >
                {previewModal.generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Gerando…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Gerar {previewModal.items.length}
                  </>
                )}
              </button>
            </div>
          </div>
        </AppModal>
      )}

      {cancelTarget && (
        <AppModal
          title="Cancelar lançamento"
          onClose={() => setCancelTarget(null)}
          maxWidth="sm"
        >
          <div className="flex flex-col gap-4 px-5 py-5">
            <p className="text-sm">
              Deseja cancelar o lançamento{" "}
              <span className="font-medium">
                {cancelTarget.title_snapshot}
              </span>
              ?
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="p-btn p-btn-ghost"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = cancelTarget.id;
                  setCancelTarget(null);
                  await doCancel(id);
                }}
                className="p-btn p-btn-primary"
              >
                Cancelar lançamento
              </button>
            </div>
          </div>
        </AppModal>
      )}

      {toDeleteEntry && (
        <ConfirmDeleteModal
          title="Remover lançamento"
          itemName={toDeleteEntry.title_snapshot}
          onCancel={() => setToDeleteEntry(null)}
          onConfirm={async () => {
            await financeGateway.deleteExpenseEntry(toDeleteEntry.id);
            setToDeleteEntry(null);
            await load();
          }}
        />
      )}

      {toDeleteTpl && (
        <ConfirmDeleteModal
          title="Remover recorrente"
          itemName={toDeleteTpl.title}
          description="Lançamentos já gerados a partir desta recorrente não serão removidos."
          onCancel={() => setToDeleteTpl(null)}
          onConfirm={async () => {
            await deleteTemplate(toDeleteTpl);
            setToDeleteTpl(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Componentes auxiliares ──────────────────────────────────────
function SumCard({ label, value, tone }) {
  const toneCls =
    tone === "success"
      ? "text-[var(--p-success)]"
      : tone === "danger"
      ? "text-[var(--p-danger)]"
      : tone === "warning"
      ? "text-[var(--p-warning)]"
      : "text-[var(--p-text)]";
  return (
    <div className="p-card p-4">
      <div className="text-xs uppercase tracking-wider text-[var(--p-text-faint)]">
        {label}
      </div>
      <div className={`p-kpi-value mt-1 text-lg md:text-xl ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}

function RowActions({ entry, busy, onMarkPaid, onReopen, onCancel, onDelete }) {
  const isPending = entry.status === "pending";
  return (
    <div className="inline-flex gap-1">
      {isPending ? (
        <>
          <button
            disabled={busy}
            onClick={onMarkPaid}
            className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-success-50)] hover:text-[var(--p-success)] disabled:opacity-50"
            aria-label="Marcar pago"
            title="Marcar pago"
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <button
            disabled={busy}
            onClick={onCancel}
            className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)] disabled:opacity-50"
            aria-label="Cancelar"
            title="Cancelar"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </>
      ) : (
        <button
          disabled={busy}
          onClick={onReopen}
          className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)] disabled:opacity-50"
          aria-label="Reabrir"
          title="Reabrir"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      )}
      <button
        disabled={busy}
        onClick={onDelete}
        className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)] disabled:opacity-50"
        aria-label="Excluir"
        title="Excluir"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Modal: Avulso ────────────────────────────────────────────────
function AvulsoModal({ ym, categories, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    const [y, m] = ym.split("-");
    return {
      date: `${y}-${m}-${String(new Date().getDate()).padStart(2, "0")}`,
      title: "",
      category: "",
      amount: "",
      cost_center: "PJ",
    };
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    if (!form.date) return setErr("Data é obrigatória");
    if (!form.title.trim()) return setErr("Título é obrigatório");
    const amt = Number(form.amount || 0);
    if (!amt || amt <= 0) return setErr("Valor deve ser maior que zero");
    try {
      setSaving(true);
      await financeGateway.createOneOffExpense({
        date: form.date,
        title: form.title.trim(),
        category: form.category.trim() || null,
        amount: amt,
        cost_center: form.cost_center,
      });
      await onSaved();
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      title="Lançamento avulso"
      onClose={saving ? () => {} : onClose}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            label="Data *"
            type="date"
            value={form.date}
            onChange={(v) => setForm((f) => ({ ...f, date: v }))}
          />
          <FormField
            label="Valor (R$) *"
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
            placeholder="0,00"
          />
        </div>
        <FormField
          label="Título *"
          value={form.title}
          onChange={(v) => setForm((f) => ({ ...f, title: v }))}
          placeholder="Ex.: Aluguel de novembro"
        />
        <CategoryField
          value={form.category}
          onChange={(v) => setForm((f) => ({ ...f, category: v }))}
          categories={categories}
        />
        <CostCenterField
          value={form.cost_center}
          onChange={(v) => setForm((f) => ({ ...f, cost_center: v }))}
        />
        <ModalActions
          onCancel={onClose}
          submitting={saving}
          submitLabel="Salvar"
        />
      </form>
    </AppModal>
  );
}

// ─── Modal: Template (recorrente) ────────────────────────────────
function TemplateFormModal({ initial, categories, templates, onClose, onSaved }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(() => ({
    title: initial?.title || "",
    category: initial?.category || "",
    amount: String(initial?.amount ?? ""),
    frequency: initial?.frequency || "monthly",
    due_day: String(initial?.due_day ?? "5"),
    due_month: String(initial?.due_month ?? "1"),
    active: initial?.active ?? true,
    cost_center: initial?.cost_center || "PJ",
    recurrence_mode: initial?.recurrence_mode || "indefinite",
    start_month: initial?.start_month
      ? String(initial.start_month).slice(0, 7)
      : "",
    installments:
      initial?.installments != null ? String(initial.installments) : "",
    end_month: initial?.end_month ? String(initial.end_month).slice(0, 7) : "",
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  // Detecção de duplicatas
  const currentShapeKey = useMemo(
    () =>
      shapeKey(form.frequency, form.due_day, form.due_month, form.cost_center),
    [form.frequency, form.due_day, form.due_month, form.cost_center]
  );

  const exactDuplicate = useMemo(() => {
    if (!form.title) return null;
    const norm = normalizeTitle(form.title);
    const amt = Number(form.amount || 0);
    return (
      templates.find(
        (t) =>
          (!isEdit || t.id !== initial?.id) &&
          !!t.active &&
          shapeKey(t.frequency, t.due_day, t.due_month, t.cost_center) ===
            currentShapeKey &&
          normalizeTitle(t.title) === norm &&
          Math.abs(Number(t.amount || 0) - amt) < 0.01
      ) || null
    );
  }, [templates, form.title, form.amount, currentShapeKey, isEdit, initial?.id]);

  const softSuggestions = useMemo(() => {
    if (!form.title) return [];
    const norm = normalizeTitle(form.title);
    const tokenSet = (s) => new Set(normalizeTitle(s).split(" ").filter(Boolean));
    const tokenJaccard = (a, b) => {
      const A = tokenSet(a);
      const B = tokenSet(b);
      if (!A.size || !B.size) return 0;
      let inter = 0;
      for (const w of A) if (B.has(w)) inter++;
      return inter / (A.size + B.size - inter);
    };
    return (templates || [])
      .filter((t) => !(isEdit && initial && t.id === initial.id))
      .map((t) => {
        const tNorm = normalizeTitle(t.title);
        const starts = tNorm.startsWith(norm) ? 1 : 0;
        const includes = !starts && tNorm.includes(norm) ? 1 : 0;
        const sim = tokenJaccard(tNorm, norm);
        const score = starts * 3 + includes * 2 + sim;
        return { t, score, starts, includes, sim };
      })
      .filter((r) => r.starts || r.includes || r.sim >= 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((r) => r.t);
  }, [templates, form.title, isEdit, initial]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    if (!form.title.trim()) return setErr("Título é obrigatório");
    if (!isEdit && exactDuplicate) {
      return setErr(
        `Já existe uma recorrente idêntica: "${exactDuplicate.title}" (${fmtBRL(
          exactDuplicate.amount
        )}). Ajuste o título ou edite a existente.`
      );
    }
    if (form.recurrence_mode === "installments") {
      if (!form.installments || Number(form.installments) < 1)
        return setErr("Informe o número de parcelas (>= 1)");
    }
    if (form.recurrence_mode === "until_month") {
      if (!form.end_month) return setErr("Informe o mês final");
      if (form.start_month && form.end_month < form.start_month)
        return setErr("Mês final deve ser maior ou igual ao mês inicial");
    }
    try {
      setSaving(true);
      const payload = {
        title: form.title.trim(),
        category: form.category.trim() || null,
        amount: Number(form.amount || 0),
        frequency: form.frequency,
        due_day: Number(form.due_day || 5),
        due_month: Number(form.due_month || 1),
        active: !!form.active,
        cost_center: form.cost_center,
        recurrence_mode: form.recurrence_mode,
        start_month: form.start_month ? `${form.start_month}-01` : null,
        installments:
          form.recurrence_mode === "installments"
            ? Number(form.installments || 0)
            : null,
        end_month:
          form.recurrence_mode === "until_month" && form.end_month
            ? `${form.end_month}-01`
            : null,
      };
      if (isEdit) {
        await financeGateway.updateExpenseTemplate(initial.id, payload);
      } else {
        await financeGateway.createExpenseTemplate(payload);
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
      title={isEdit ? "Editar recorrente" : "Nova recorrente"}
      onClose={saving ? () => {} : onClose}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />

        <FormField
          label="Título *"
          value={form.title}
          onChange={(v) => setForm((f) => ({ ...f, title: v }))}
          autoFocus
          placeholder="Ex.: Aluguel"
        />

        {!!softSuggestions.length && (
          <div className="rounded-lg border border-[var(--p-warning)]/30 bg-[var(--p-warning-50)] px-3 py-2 text-xs text-[var(--p-warning)]">
            <div className="font-medium mb-1">Possíveis duplicatas:</div>
            <ul className="space-y-0.5">
              {softSuggestions.map((t) => (
                <li key={t.id}>
                  <span className="font-medium">{t.title}</span>{" "}
                  <span className="opacity-70">— {fmtBRL(t.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CategoryField
            value={form.category}
            onChange={(v) => setForm((f) => ({ ...f, category: v }))}
            categories={categories}
          />
          <FormField
            label="Valor (R$) *"
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CostCenterField
            value={form.cost_center}
            onChange={(v) => setForm((f) => ({ ...f, cost_center: v }))}
          />
          <SelectField
            label="Frequência *"
            value={form.frequency}
            onChange={(v) => setForm((f) => ({ ...f, frequency: v }))}
            options={[
              { value: "monthly", label: "Mensal" },
              { value: "annual", label: "Anual" },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField
            label="Duração"
            value={form.recurrence_mode}
            onChange={(v) => setForm((f) => ({ ...f, recurrence_mode: v }))}
            options={[
              { value: "indefinite", label: "Indefinida" },
              { value: "installments", label: "Por parcelas" },
              { value: "until_month", label: "Até um mês" },
            ]}
          />
          <FormField
            label="Início (mês)"
            type="month"
            value={form.start_month}
            onChange={(v) => setForm((f) => ({ ...f, start_month: v }))}
          />
        </div>

        {form.frequency === "annual" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              label="Mês"
              type="number"
              min="1"
              max="12"
              value={form.due_month}
              onChange={(v) => setForm((f) => ({ ...f, due_month: v }))}
            />
            <FormField
              label="Dia"
              type="number"
              min="1"
              max="28"
              value={form.due_day}
              onChange={(v) => setForm((f) => ({ ...f, due_day: v }))}
            />
          </div>
        ) : (
          <FormField
            label="Dia de vencimento"
            type="number"
            min="1"
            max="28"
            value={form.due_day}
            onChange={(v) => setForm((f) => ({ ...f, due_day: v }))}
          />
        )}

        {form.recurrence_mode === "installments" && (
          <FormField
            label="Parcelas"
            type="number"
            min="1"
            value={form.installments}
            onChange={(v) => setForm((f) => ({ ...f, installments: v }))}
          />
        )}

        {form.recurrence_mode === "until_month" && (
          <FormField
            label="Até (mês)"
            type="month"
            value={form.end_month}
            onChange={(v) => setForm((f) => ({ ...f, end_month: v }))}
          />
        )}

        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) =>
              setForm((f) => ({ ...f, active: e.target.checked }))
            }
          />
          Ativo (gera lançamentos no mês)
        </label>

        <ModalActions
          onCancel={onClose}
          submitting={saving}
          submitLabel={isEdit ? "Salvar" : "Cadastrar"}
        />
      </form>
    </AppModal>
  );
}

// ─── Helpers de form ─────────────────────────────────────────────
function FormField({
  label,
  value,
  type = "text",
  onChange,
  placeholder,
  autoFocus,
  min,
  max,
  step,
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--p-text-muted)]">
        {label}
      </span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        min={min}
        max={max}
        step={step}
        className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--p-text-muted)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CategoryField({ value, onChange, categories }) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--p-text-muted)]">
          Categoria
        </span>
        <Link
          href="/financeiro/categorias"
          className="text-[11px] text-[var(--p-text-muted)] underline"
        >
          Gerenciar
        </Link>
      </div>
      {categories?.length > 0 ? (
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
        >
          <option value="">(sem categoria)</option>
          {categories.map((c) => (
            <option key={c.id ?? c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Digite a categoria"
          className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
        />
      )}
    </label>
  );
}

function CostCenterField({ value, onChange }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--p-text-muted)]">
        Centro de custos *
      </span>
      <div className="flex gap-1">
        {[
          { v: "PJ", label: "PJ", desc: "Empresa" },
          { v: "PF", label: "PF", desc: "Pessoal" },
        ].map((opt) => {
          const active = value === opt.v;
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => onChange(opt.v)}
              title={opt.desc}
              className={[
                "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                active
                  ? "border-[var(--p-primary)] bg-[var(--p-primary-50)] text-[var(--p-primary)] font-medium"
                  : "border-[var(--p-border)] bg-[var(--p-surface)] text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]",
              ].join(" ")}
            >
              <div>{opt.label}</div>
              <div className="text-[10px] opacity-70">{opt.desc}</div>
            </button>
          );
        })}
      </div>
    </label>
  );
}

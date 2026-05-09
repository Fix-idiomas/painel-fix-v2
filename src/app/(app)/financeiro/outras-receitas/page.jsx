"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { financeGateway } from "@/lib/financeGateway";
import {
  Search,
  Plus,
  Trash2,
  Pencil,
  CheckCircle2,
  XCircle,
  RotateCcw,
  MoreHorizontal,
  Calendar,
  Download,
  Sparkles,
  Loader2,
} from "lucide-react";
import AppModal, {
  FormError,
  ModalActions,
  ConfirmDeleteModal,
} from "@/components/AppModal";

// ─── Helpers ──────────────────────────────────────────────────────
const ymNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const fmtBRL = (n) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const fmtBRDate = (v) => {
  if (!v) return "—";
  const s = String(v).slice(0, 10);
  const [Y, M, D] = s.split("-");
  return Y && M && D ? `${D}/${M}/${Y}` : s;
};

function ymLabel(ym) {
  const [y, m] = String(ym || "").split("-");
  const names = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  const idx = Math.max(1, Math.min(12, Number(m || 0))) - 1;
  return `${names[idx]} de ${y}`;
}

function getParcelInfo(row) {
  const idx = Number(row?.installment_index || 0);
  const tot = Number(row?.installments_total || 0);
  if (idx > 0 && tot > 0) return { index: idx, total: tot };
  const m = String(row?.title || "").match(/\((\d+)\s*\/\s*(\d+)\)\s*$/);
  if (m) {
    const i = Number(m[1]);
    const t = Number(m[2]);
    if (i > 0 && t > 0) return { index: i, total: t };
  }
  return { index: 0, total: 0 };
}

function isSeries(row) {
  const p = getParcelInfo(row);
  return p.total > 1;
}

const csvCell = (v) => {
  const s = (v ?? "").toString();
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function exportCSV(rows, ym, status, costCenter) {
  const header = [
    "Título", "Categoria", "Centro de Custo",
    "Competência", "Vencimento", "Valor", "Status",
  ].join(",");
  const lines = [header];
  for (const r of rows) {
    lines.push([
      csvCell(r.title),
      csvCell(r.category || ""),
      csvCell(r.cost_center || ""),
      csvCell(r.competence_month),
      csvCell(r.due_date),
      Number(r.amount || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      csvCell(r.status),
    ].join(","));
  }
  const bom = "﻿";
  const blob = new Blob([bom + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const tag = [
    `outras_receitas_${ym}`,
    status && status !== "all" ? `_${status}` : "",
    costCenter && costCenter !== "all" ? `_${costCenter}` : "",
  ].join("");
  a.href = url;
  a.download = `${tag}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function statusBadge(row) {
  const today = new Date().toISOString().slice(0, 10);
  if (row.status === "paid") return { cls: "p-chip-success", label: "Pago" };
  if (row.status === "canceled") return { cls: "p-chip-neutral", label: "Cancelado" };
  if (
    row.status === "pending" &&
    row.due_date &&
    String(row.due_date).slice(0, 10) < today
  ) {
    return {
      cls: "p-chip-danger",
      label: `Atraso ${row.days_overdue || 0}d`,
    };
  }
  return { cls: "p-chip-warning", label: "Pendente" };
}

// ─── Wrapper Suspense ────────────────────────────────────────────
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 p-6 text-sm text-[var(--p-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      }
    >
      <OutrasReceitasPage />
    </Suspense>
  );
}

function OutrasReceitasPage() {
  const search = useSearchParams();
  const router = useRouter();

  // Filtros (URL-synced)
  const [ym, setYm] = useState(search.get("ym") || ymNow());
  const [status, setStatus] = useState(search.get("status") || "all");
  const [costCenter, setCostCenter] = useState(search.get("cc") || "all");
  const [q, setQ] = useState("");

  // Dados
  const [rows, setRows] = useState([]);
  const [kpis, setKpis] = useState({
    total: 0, paid: 0, pending: 0, overdue: 0,
  });
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Modais
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null); // pode ser série
  const [toDelete, setToDelete] = useState(null); // {row, scope: 'one'|'series'}

  // Sync URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (ym) params.set("ym", ym);
    if (status && status !== "all") params.set("status", status);
    if (costCenter && costCenter !== "all") params.set("cc", costCenter);
    router.replace(`/financeiro/outras-receitas?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, status, costCenter]);

  async function load() {
    try {
      setError(null);
      const res = await financeGateway.listOtherRevenues({
        ym,
        status,
        cost_center: costCenter === "all" ? null : costCenter,
      });
      setRows(Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : []);
      setKpis(res?.kpis || { total: 0, paid: 0, pending: 0, overdue: 0 });
    } catch (e) {
      setError(e?.message || String(e));
      setRows([]);
    }
  }

  useEffect(() => {
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
  }, [ym, status, costCenter]);

  // Categorias
  useEffect(() => {
    (async () => {
      try {
        const list = await financeGateway.listExpenseCategories();
        setCategories(Array.isArray(list) ? list : []);
      } catch {
        setCategories([]);
      }
    })();
  }, []);

  // Filtragem cliente (busca)
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const sorted = [...rows].sort((a, b) =>
      String(a.due_date).localeCompare(String(b.due_date))
    );
    if (!term) return sorted;
    return sorted.filter((r) => {
      const s =
        String(r.title || "").toLowerCase() +
        " " +
        String(r.category || "").toLowerCase();
      return s.includes(term);
    });
  }, [rows, q]);

  // Ações
  async function onMarkPaid(id) {
    try {
      setBusyId(id);
      await financeGateway.markOtherRevenuePaid(id);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }
  async function onReopen(id) {
    try {
      setBusyId(id);
      await financeGateway.reopenOtherRevenue(id);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }
  async function doCancel(id, note) {
    try {
      setBusyId(id);
      await financeGateway.cancelOtherRevenue(id, note);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }
  async function doCancelSeries(row, note) {
    try {
      setBusyId(row.id);
      await financeGateway.cancelOtherRevenueSeriesFrom(row.id, note);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }
  async function doDelete(row, scope) {
    try {
      setBusyId(row.id);
      if (scope === "series") {
        await financeGateway.deleteOtherRevenueSeriesFrom(row.id);
      } else {
        await financeGateway.deleteOtherRevenue(row.id);
      }
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onGenerateMonth() {
    if (!confirm("Gerar receitas recorrentes (templates) para este mês?"))
      return;
    try {
      await financeGateway.ensureOtherRevenuesForMonth(ym);
      await load();
    } catch (e) {
      alert(e?.message || String(e));
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Outras receitas
          </h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${ymLabel(ym)} · ${rows.length} lançamentos`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onGenerateMonth}
            className="p-btn p-btn-ghost"
            title="Gerar receitas recorrentes (templates) para este mês"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Gerar mês</span>
          </button>
          <button
            onClick={() => exportCSV(filtered, ym, status, costCenter)}
            disabled={filtered.length === 0}
            className="p-btn p-btn-ghost"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="p-btn p-btn-primary"
          >
            <Plus className="h-4 w-4" />
            <span>Nova receita</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <SumCard label="Total" value={fmtBRL(kpis.total)} />
        <SumCard label="Pagas" value={fmtBRL(kpis.paid)} tone="success" />
        <SumCard label="Pendentes" value={fmtBRL(kpis.pending)} tone="warning" />
        <SumCard label="Atrasadas" value={fmtBRL(kpis.overdue)} tone="danger" />
      </div>

      {/* Filtros */}
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
          <div className="flex gap-1 min-w-max">
            {[
              { key: "all", label: "Todos" },
              { key: "pending", label: "Pendentes" },
              { key: "paid", label: "Pagos" },
              { key: "overdue", label: "Atrasados" },
              { key: "canceled", label: "Cancelados" },
            ].map((f) => {
              const active = status === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setStatus(f.key)}
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
          <div className="flex gap-1 min-w-max">
            {[
              { key: "all", label: "Todos centros" },
              { key: "extra", label: "Extra" },
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

      {/* Lista */}
      <div className="p-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-[var(--p-text-muted)]">
            Sem receitas para este filtro.
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
                    <th className="px-5 py-3">Parcela</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Valor</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--p-border)]">
                  {filtered.map((r) => {
                    const sb = statusBadge(r);
                    const p = getParcelInfo(r);
                    return (
                      <tr
                        key={r.id}
                        className="hover:bg-[var(--p-surface-2)]"
                      >
                        <td className="px-5 py-3 tabular-nums text-[var(--p-text-muted)]">
                          {fmtBRDate(r.due_date)}
                        </td>
                        <td className="px-5 py-3 font-medium">
                          <span className="truncate">{r.title || "—"}</span>
                          {p.total > 1 && (
                            <span
                              className="ml-2 align-middle text-[10px] uppercase tracking-wider text-[var(--p-text-faint)]"
                              title={`Série de ${p.total} parcelas — esta é a ${p.index}`}
                            >
                              série
                            </span>
                          )}
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
                        <td className="px-5 py-3 text-xs font-medium text-[var(--p-text-muted)]">
                          {r.cost_center || "—"}
                        </td>
                        <td className="px-5 py-3 text-xs tabular-nums text-[var(--p-text-muted)]">
                          {p.total > 0 ? `${p.index}/${p.total}` : "—"}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`p-chip ${sb.cls}`}>{sb.label}</span>
                        </td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums text-[var(--p-success)]">
                          +{fmtBRL(r.amount)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <RowActions
                            row={r}
                            busy={busyId === r.id}
                            onMarkPaid={() => onMarkPaid(r.id)}
                            onReopen={() => onReopen(r.id)}
                            onCancel={() => setCancelTarget(r)}
                            onEdit={() => setEditTarget(r)}
                            onDelete={() =>
                              setToDelete({
                                row: r,
                                scope: isSeries(r) ? "series" : "one",
                              })
                            }
                          />
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
                const sb = statusBadge(r);
                const p = getParcelInfo(r);
                return (
                  <li
                    key={r.id}
                    className="flex flex-col gap-2 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {r.title || "—"}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--p-text-muted)]">
                          <span>{fmtBRDate(r.due_date)}</span>
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
                          {p.total > 0 && (
                            <span className="rounded bg-[var(--p-surface-2)] px-1.5 py-0.5 font-medium">
                              {p.index}/{p.total}
                            </span>
                          )}
                          <span className={`p-chip ${sb.cls}`}>{sb.label}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold tabular-nums text-[var(--p-success)]">
                          +{fmtBRL(r.amount)}
                        </div>
                      </div>
                    </div>
                    <RowActions
                      row={r}
                      busy={busyId === r.id}
                      onMarkPaid={() => onMarkPaid(r.id)}
                      onReopen={() => onReopen(r.id)}
                      onCancel={() => setCancelTarget(r)}
                      onEdit={() => setEditTarget(r)}
                      onDelete={() =>
                        setToDelete({
                          row: r,
                          scope: isSeries(r) ? "series" : "one",
                        })
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-[var(--p-text-muted)]">
            Total do filtro:
          </span>
          <span className="p-kpi-value text-base text-[var(--p-success)]">
            +{fmtBRL(filtered.reduce((a, r) => a + Number(r.amount || 0), 0))}
          </span>
        </div>
      )}

      {/* Modais */}
      {createOpen && (
        <CreateRevenueModal
          ym={ym}
          categories={categories}
          onClose={() => setCreateOpen(false)}
          onSaved={async () => {
            setCreateOpen(false);
            await load();
          }}
        />
      )}

      {editTarget && (
        <EditRevenueModal
          row={editTarget}
          categories={categories}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            await load();
          }}
        />
      )}

      {cancelTarget && (
        <CancelRevenueModal
          row={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelOne={async (note) => {
            const id = cancelTarget.id;
            setCancelTarget(null);
            await doCancel(id, note);
          }}
          onCancelSeries={async (note) => {
            const r = cancelTarget;
            setCancelTarget(null);
            await doCancelSeries(r, note);
          }}
        />
      )}

      {toDelete && (
        <ConfirmDeleteModal
          title={
            toDelete.scope === "series"
              ? "Excluir série"
              : "Excluir receita"
          }
          itemName={toDelete.row.title}
          description={
            toDelete.scope === "series"
              ? "As FUTURAS parcelas pendentes serão excluídas. Pagas anteriores permanecem."
              : "Esta ação não pode ser desfeita."
          }
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            const t = toDelete;
            setToDelete(null);
            await doDelete(t.row, t.scope);
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

function RowActions({ row, busy, onMarkPaid, onReopen, onCancel, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const canMarkPaid =
    row.status !== "paid" && row.status !== "canceled";
  const canCancelAct = row.status !== "canceled";
  const canReopenAct = row.status !== "pending";

  function run(fn) {
    setOpen(false);
    fn();
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] disabled:opacity-50"
        aria-label="Ações"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MoreHorizontal className="h-4 w-4" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] shadow-lg">
          {canMarkPaid && (
            <button
              type="button"
              onClick={() => run(onMarkPaid)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--p-surface-2)]"
            >
              <CheckCircle2 className="h-4 w-4 text-[var(--p-success)]" />{" "}
              Marcar como pago
            </button>
          )}
          {canReopenAct && (
            <button
              type="button"
              onClick={() => run(onReopen)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--p-surface-2)]"
            >
              <RotateCcw className="h-4 w-4 text-[var(--p-text-muted)]" />{" "}
              Reabrir
            </button>
          )}
          {canCancelAct && (
            <button
              type="button"
              onClick={() => run(onCancel)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--p-surface-2)]"
            >
              <XCircle className="h-4 w-4 text-[var(--p-text-muted)]" />{" "}
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={() => run(onEdit)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--p-surface-2)]"
          >
            <Pencil className="h-4 w-4 text-[var(--p-text-muted)]" /> Editar
          </button>
          <div className="my-1 h-px bg-[var(--p-border)]" />
          <button
            type="button"
            onClick={() => run(onDelete)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--p-danger)] hover:bg-[var(--p-danger-50)]"
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Modal: Cancelar (com opção de série) ────────────────────────
function CancelRevenueModal({ row, onClose, onCancelOne, onCancelSeries }) {
  const p = getParcelInfo(row);
  const isSer = p.total > 1;
  const future = p.total && p.index ? p.total - p.index + 1 : 0;
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(null); // 'one' | 'series'

  return (
    <AppModal
      title="Cancelar receita"
      onClose={busy ? () => {} : onClose}
      maxWidth="md"
    >
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="text-sm text-[var(--p-text-muted)]">
          <div>
            Receita:{" "}
            <span className="font-medium text-[var(--p-text)]">
              {row.title}
            </span>
          </div>
          {p.total > 0 && (
            <div className="mt-1 text-xs">
              Parcela{" "}
              <span className="font-medium text-[var(--p-text)]">
                {p.index}/{p.total}
              </span>
            </div>
          )}
          {isSer && (
            <p className="mt-2 text-xs">
              Se cancelar a série, as <b>{future} parcela(s) pendente(s)</b>{" "}
              a partir desta serão canceladas. Pagas anteriores permanecem.
            </p>
          )}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Motivo (opcional)
          </span>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={!!busy}
            className="p-btn p-btn-ghost"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={async () => {
              setBusy("one");
              await onCancelOne(note);
            }}
            disabled={!!busy}
            className="p-btn p-btn-ghost"
          >
            {busy === "one" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            Cancelar somente esta
          </button>
          {isSer && (
            <button
              type="button"
              onClick={async () => {
                setBusy("series");
                await onCancelSeries(note);
              }}
              disabled={!!busy}
              className="p-btn p-btn-primary"
            >
              {busy === "series" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Cancelar série
            </button>
          )}
        </div>
      </div>
    </AppModal>
  );
}

// ─── Modal: Criar receita ────────────────────────────────────────
function CreateRevenueModal({ ym, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: "",
    amount: "",
    category: "",
    cost_center: "extra",
    frequency: "monthly", // monthly | yearly
    as_template: false,
    parcelas: "1",
    due_day: "5",
    due_month: String(new Date().getMonth() + 1).padStart(2, "0"),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    if (!form.title.trim()) return setErr("Título é obrigatório");
    const amt = Number(form.amount || 0);
    if (!amt || amt <= 0) return setErr("Valor deve ser maior que zero");
    try {
      setSaving(true);
      if (form.frequency === "yearly") {
        const year = String(ym).slice(0, 4);
        const mm = String(form.due_month || "01").padStart(2, "0");
        const dd = String(
          Math.min(Math.max(Number(form.due_day || 5), 1), 28)
        ).padStart(2, "0");
        await financeGateway.createOtherRevenue({
          ym,
          title: form.title.trim(),
          amount: amt,
          due_date: `${year}-${mm}-${dd}`,
          category: form.category || null,
          cost_center: form.cost_center || "extra",
          recurrence_kind: "indefinite",
          frequency: "yearly",
          start_month: `${ym}-01`,
        });
      } else if (form.as_template) {
        await financeGateway.createOtherRevenueTemplate({
          title: form.title.trim(),
          amount: amt,
          frequency: "monthly",
          recurrence_type: "indefinite",
          due_day: Number(form.due_day || 5),
          start_month: `${ym}-01`,
          end_month: null,
          active: true,
          category: form.category || null,
          cost_center: form.cost_center || "extra",
        });
        try {
          await financeGateway.ensureOtherRevenuesForMonth(ym);
        } catch {
          /* ignore */
        }
      } else {
        const total = Math.max(1, Number(form.parcelas || 1));
        await financeGateway.createOtherRevenueInstallments({
          ym,
          title: form.title.trim(),
          amount: amt,
          total_installments: total,
          due_day: Number(form.due_day || 5),
          category: form.category || null,
          cost_center: form.cost_center || "extra",
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
      title="Nova receita"
      onClose={saving ? () => {} : onClose}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />

        <FormField
          label="Descrição *"
          value={form.title}
          onChange={(v) => update("title", v)}
          autoFocus
          placeholder="Ex.: Aula particular"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            label="Valor (R$) *"
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(v) => update("amount", v)}
          />
          <SelectField
            label="Frequência *"
            value={form.frequency}
            onChange={(v) => update("frequency", v)}
            options={[
              { value: "monthly", label: "Mensal" },
              { value: "yearly", label: "Anual" },
            ]}
          />
        </div>

        {form.frequency === "monthly" && (
          <>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.as_template}
                onChange={(e) => update("as_template", e.target.checked)}
              />
              Gerar automaticamente todo mês (recorrente indefinido)
            </label>
            {!form.as_template && (
              <FormField
                label="Nº parcelas *"
                type="number"
                min="1"
                value={form.parcelas}
                onChange={(v) => update("parcelas", v)}
              />
            )}
          </>
        )}

        {form.frequency === "yearly" && (
          <SelectField
            label="Mês do vencimento *"
            value={form.due_month}
            onChange={(v) => update("due_month", v)}
            options={Array.from({ length: 12 }, (_, i) => {
              const v = String(i + 1).padStart(2, "0");
              return { value: v, label: v };
            })}
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            label="Dia de vencimento *"
            type="number"
            min="1"
            max="28"
            value={form.due_day}
            onChange={(v) => update("due_day", v)}
          />
          <CostCenterField
            value={form.cost_center}
            onChange={(v) => update("cost_center", v)}
          />
        </div>

        <CategoryField
          value={form.category}
          onChange={(v) => update("category", v)}
          categories={categories}
        />

        <p className="text-xs text-[var(--p-text-faint)]">
          {form.frequency === "yearly" ? (
            <>
              Gera 1 receita anual com vencimento em{" "}
              {String(form.due_day).padStart(2, "0")}/{form.due_month}/
              {String(ym).slice(0, 4)}.
            </>
          ) : form.as_template ? (
            <>
              Gerará automaticamente 1 receita por mês (dia{" "}
              {String(form.due_day).padStart(2, "0")}) a partir de {ym}.
            </>
          ) : (
            <>
              Gera {form.parcelas || 1} receita(s) mensal(is) a partir de{" "}
              {ym}.
            </>
          )}
        </p>

        <ModalActions
          onCancel={onClose}
          submitting={saving}
          submitLabel="Cadastrar"
        />
      </form>
    </AppModal>
  );
}

// ─── Modal: Editar receita ───────────────────────────────────────
function EditRevenueModal({ row, categories, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: row.title || "",
    amount: String(row.amount ?? ""),
    due_date: (row.due_date || "").slice(0, 10),
    category: row.category || "",
    cost_center: row.cost_center || "extra",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    if (!form.title.trim()) return setErr("Título é obrigatório");
    try {
      setSaving(true);
      await financeGateway.updateOtherRevenue(row.id, {
        title: form.title.trim(),
        amount: Number(form.amount || 0),
        due_date: form.due_date ? form.due_date.slice(0, 10) : null,
        category: form.category || null,
        cost_center: form.cost_center || "extra",
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
      title="Editar receita"
      onClose={saving ? () => {} : onClose}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        <FormField
          label="Descrição *"
          value={form.title}
          onChange={(v) => update("title", v)}
          autoFocus
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            label="Valor (R$) *"
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(v) => update("amount", v)}
          />
          <FormField
            label="Vencimento"
            type="date"
            value={form.due_date}
            onChange={(v) => update("due_date", v)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CategoryField
            value={form.category}
            onChange={(v) => update("category", v)}
            categories={categories}
          />
          <CostCenterField
            value={form.cost_center}
            onChange={(v) => update("cost_center", v)}
          />
        </div>
        <ModalActions
          onCancel={onClose}
          submitting={saving}
          submitLabel="Salvar"
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
      <span className="text-xs font-medium text-[var(--p-text-muted)]">
        Categoria
      </span>
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
          placeholder="Ex.: Taxa de matrícula"
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
        Centro de custo
      </span>
      <div className="flex gap-1">
        {[
          { v: "extra", label: "Extra" },
          { v: "PJ", label: "PJ" },
          { v: "PF", label: "PF" },
        ].map((opt) => {
          const active = value === opt.v;
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => onChange(opt.v)}
              className={[
                "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                active
                  ? "border-[var(--p-primary)] bg-[var(--p-primary-50)] text-[var(--p-primary)] font-medium"
                  : "border-[var(--p-border)] bg-[var(--p-surface)] text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]",
              ].join(" ")}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </label>
  );
}

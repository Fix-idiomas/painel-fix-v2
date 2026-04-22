"use client";

import { useEffect, useMemo, useState } from "react";
import PreviewShell from "../_components/PreviewShell";
import PreviewModal, { FormError, ModalActions, ConfirmDeleteModal } from "../_components/PreviewModal";
import { financeGateway } from "@/lib/financeGateway";
import {
  Search,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2,
  Calendar,
  ChevronDown,
  Loader2,
} from "lucide-react";

function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function money(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fdate(d) {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-");
  if (!y || !m || !day) return "—";
  return `${day}/${m}/${y}`;
}
function ymLabel(ym) {
  const [y, m] = String(ym || "").split("-");
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const idx = Math.max(1, Math.min(12, Number(m || 0))) - 1;
  return `${names[idx]} de ${y}`;
}
function statusChip(row) {
  const today = new Date().toISOString().slice(0, 10);
  if (row.status === "paid") return { cls: "p-chip-success", icon: CheckCircle2, label: "Pago" };
  if (row.status === "canceled") return { cls: "p-chip-neutral", icon: Clock, label: "Cancelado" };
  if (row.status === "pending" && row.due_date && row.due_date < today) {
    return { cls: "p-chip-danger", icon: AlertCircle, label: `Atraso ${row.days_overdue || 0}d` };
  }
  return { cls: "p-chip-warning", icon: Clock, label: "Pendente" };
}

const FILTERS = [
  { key: "all", label: "Todos" },
  { key: "paid", label: "Pagos" },
  { key: "pending", label: "Pendentes" },
];

export default function GastosPreview() {
  const [ym, setYm] = useState(currentYm());
  const [rows, setRows] = useState([]);
  const [kpis, setKpis] = useState({ total: 0, paid: 0, pending: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [toDelete, setToDelete] = useState(null);

  async function load() {
    try {
      setError(null);
      const [res, cats] = await Promise.all([
        financeGateway.listExpenseEntries({ ym }),
        financeGateway.listExpenseCategories(),
      ]);
      setRows(Array.isArray(res?.rows) ? res.rows : []);
      setKpis(res?.kpis || { total: 0, paid: 0, pending: 0, overdue: 0 });
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

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!term) return true;
      const s = String(r.title_snapshot || "").toLowerCase() + " " + String(r.category || "").toLowerCase();
      return s.includes(term);
    });
  }, [rows, q, filter]);

  return (
    <PreviewShell
      active="financeiro"
      crumb="Financeiro"
      title="Gastos"
      rightAction={
        <button className="p-btn p-btn-primary" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo gasto</span>
          <span className="sm:hidden">Novo</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Gastos</h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading ? "Carregando…" : `${ymLabel(ym)} · ${rows.length} lançamentos`}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3 md:gap-4">
          <SumCard label="Total" value={money(kpis.total)} />
          <SumCard label="Pago" value={money(kpis.paid)} tone="success" />
          <SumCard label="Em atraso" value={money(kpis.overdue)} tone="danger" />
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--p-text-faint)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar descrição ou categoria…"
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--p-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </div>
          <MonthPicker ym={ym} onChange={setYm} />
        </div>

        <div className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1 min-w-max">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-[var(--p-primary)] text-white" : "bg-[var(--p-surface)] border border-[var(--p-border)] text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]",
                  ].join(" ")}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
            Erro: {error}
          </div>
        )}

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
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--p-border)] bg-[var(--p-surface-2)] text-left text-xs font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                      <th className="px-5 py-3">Vencimento</th>
                      <th className="px-5 py-3">Descrição</th>
                      <th className="px-5 py-3">Categoria</th>
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
                          <td className="px-5 py-3 tabular-nums text-[var(--p-text-muted)]">{fdate(r.due_date)}</td>
                          <td className="px-5 py-3 font-medium">{r.title_snapshot || "—"}</td>
                          <td className="px-5 py-3">
                            {r.category ? <span className="p-chip p-chip-neutral">{r.category}</span> : <span className="text-xs text-[var(--p-text-faint)]">—</span>}
                          </td>
                          <td className="px-5 py-3"><span className={`p-chip ${cls}`}><Icon className="h-3 w-3" /> {label}</span></td>
                          <td className="px-5 py-3 text-right font-semibold tabular-nums text-[var(--p-danger)]">−{money(r.amount)}</td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => setToDelete(r)}
                              className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)]"
                              aria-label="Remover gasto"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-[var(--p-border)] md:hidden">
                {filtered.map((r) => {
                  const { cls, icon: Icon, label } = statusChip(r);
                  return (
                    <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="w-14 shrink-0 text-xs text-[var(--p-text-muted)] tabular-nums">
                        {fdate(r.due_date).slice(0, 5)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.title_snapshot || "—"}</div>
                            <span className={`p-chip ${cls} mt-1`}><Icon className="h-3 w-3" /> {label}</span>
                          </div>
                          <div className="flex items-start gap-2 shrink-0">
                            <div className="text-sm font-semibold tabular-nums text-[var(--p-danger)]">
                              −{money(r.amount)}
                            </div>
                            <button
                              onClick={() => setToDelete(r)}
                              className="rounded p-1 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-danger)]"
                              aria-label="Remover"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>

      {modalOpen && (
        <NewExpenseModal
          categories={categories}
          ym={ym}
          onClose={() => setModalOpen(false)}
          onCreated={async () => {
            setModalOpen(false);
            await load();
          }}
        />
      )}

      {toDelete && (
        <ConfirmDeleteModal
          title="Remover gasto"
          itemName={toDelete.title_snapshot || toDelete.title}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await financeGateway.deleteExpenseEntry(toDelete.id);
            setToDelete(null);
            await load();
          }}
        />
      )}
    </PreviewShell>
  );
}

function NewExpenseModal({ categories, ym, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(() => {
    const [y, m] = ym.split("-");
    return `${y}-${m}-${String(new Date().getDate()).padStart(2, "0")}`;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    const trimmed = title.trim();
    if (!trimmed) { setErr("Descrição é obrigatória"); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { setErr("Valor deve ser maior que zero"); return; }
    try {
      setSaving(true);
      await financeGateway.createOneOffExpense({
        title: trimmed,
        amount: amt,
        date,
        category: category || null,
        cost_center: "PJ",
      });
      await onCreated();
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PreviewModal title="Novo gasto" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">Descrição *</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Aluguel de novembro"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">Valor (R$) *</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">Vencimento</span>
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
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          >
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
        <ModalActions onCancel={onClose} submitting={saving} submitLabel="Cadastrar" submitIcon={saving ? Loader2 : Plus} />
      </form>
    </PreviewModal>
  );
}

function SumCard({ label, value, tone }) {
  const toneCls =
    tone === "success" ? "text-[var(--p-success)]" :
    tone === "danger"  ? "text-[var(--p-danger)]"  :
                         "text-[var(--p-text)]";
  return (
    <div className="p-card p-4">
      <div className="text-xs text-[var(--p-text-muted)]">{label}</div>
      <div className={`p-kpi-value mt-1 text-lg md:text-xl ${toneCls}`}>{value}</div>
    </div>
  );
}

function MonthPicker({ ym, onChange }) {
  const [open, setOpen] = useState(false);
  const shift = (delta) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <div className="relative">
      <button className="p-btn p-btn-ghost" onClick={() => setOpen((v) => !v)}>
        <Calendar className="h-4 w-4" />
        <span>{ymLabel(ym)}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 flex items-center gap-1 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] p-1 shadow-lg">
          <button className="rounded-md px-2 py-1 text-sm hover:bg-[var(--p-surface-2)]" onClick={() => shift(-1)}>◂</button>
          <span className="px-2 text-xs font-medium">{ymLabel(ym)}</span>
          <button className="rounded-md px-2 py-1 text-sm hover:bg-[var(--p-surface-2)]" onClick={() => shift(1)}>▸</button>
        </div>
      )}
    </div>
  );
}

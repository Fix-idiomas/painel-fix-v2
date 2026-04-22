"use client";

import { useEffect, useMemo, useState } from "react";
import PreviewShell from "../../_components/PreviewShell";
import PreviewModal, { FormError, ModalActions, ConfirmDeleteModal } from "../../_components/PreviewModal";
import { financeGateway } from "@/lib/financeGateway";
import {
  Search,
  Plus,
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

export default function OutrasReceitasPreview() {
  const [ym, setYm] = useState(currentYm());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  async function load() {
    try {
      setError(null);
      const res = await financeGateway.listOtherRevenues({ ym });
      const data = Array.isArray(res) ? res : Array.isArray(res?.rows) ? res.rows : [];
      setRows(data);
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
    if (!term) return rows;
    return rows.filter((r) => {
      const s = String(r.title || "").toLowerCase() + " " + String(r.category || "").toLowerCase();
      return s.includes(term);
    });
  }, [rows, q]);

  const total = filtered.reduce((a, r) => a + Number(r.amount || 0), 0);

  return (
    <PreviewShell
      active="financeiro"
      crumb="Financeiro"
      title="Outras receitas"
      rightAction={
        <button className="p-btn p-btn-primary" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova receita</span>
          <span className="sm:hidden">Nova</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Outras receitas</h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading ? "Carregando…" : `${ymLabel(ym)} · ${filtered.length} lançamentos · ${money(total)}`}
          </p>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
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
              Nenhuma receita neste mês.
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--p-border)] bg-[var(--p-surface-2)] text-left text-xs font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                      <th className="px-5 py-3">Data</th>
                      <th className="px-5 py-3">Descrição</th>
                      <th className="px-5 py-3">Categoria</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Valor</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--p-border)]">
                    {filtered.map((r) => (
                      <tr key={r.id} className="hover:bg-[var(--p-surface-2)]">
                        <td className="px-5 py-3 tabular-nums text-[var(--p-text-muted)]">{fdate(r.due_date)}</td>
                        <td className="px-5 py-3 font-medium">{r.title || "—"}</td>
                        <td className="px-5 py-3">
                          {r.category ? <span className="p-chip p-chip-neutral">{r.category}</span> : <span className="text-xs text-[var(--p-text-faint)]">—</span>}
                        </td>
                        <td className="px-5 py-3 text-xs text-[var(--p-text-muted)]">{r.status || "—"}</td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums text-[var(--p-success)]">+{money(r.amount)}</td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => setToDelete(r)}
                            className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)]"
                            aria-label="Remover receita"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-[var(--p-border)] md:hidden">
                {filtered.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="w-14 shrink-0 text-xs text-[var(--p-text-muted)] tabular-nums">
                      {fdate(r.due_date).slice(0, 5)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{r.title || "—"}</div>
                          {r.category && <span className="p-chip p-chip-neutral mt-1">{r.category}</span>}
                        </div>
                        <div className="flex items-start gap-2 shrink-0">
                          <div className="text-sm font-semibold tabular-nums text-[var(--p-success)]">
                            +{money(r.amount)}
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
                ))}
              </ul>
            </>
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <span className="text-[var(--p-text-muted)]">Total do período:</span>
            <span className="p-kpi-value text-base text-[var(--p-success)]">+{money(total)}</span>
          </div>
        )}
      </div>

      {modalOpen && (
        <NewRevenueModal
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
          title="Remover receita"
          itemName={toDelete.title}
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await financeGateway.deleteOtherRevenue(toDelete.id);
            setToDelete(null);
            await load();
          }}
        />
      )}
    </PreviewShell>
  );
}

function NewRevenueModal({ ym, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const [y, m] = ym.split("-");
    return `${y}-${m}-05`;
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
      await financeGateway.createOtherRevenue({
        ym,
        title: trimmed,
        amount: amt,
        due_date: dueDate,
        category: category.trim() || null,
        cost_center: "extra",
      });
      await onCreated();
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PreviewModal title="Nova receita" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">Descrição *</span>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Aula particular"
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
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">Categoria</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Ex.: Taxa de matrícula"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <ModalActions onCancel={onClose} submitting={saving} submitLabel="Cadastrar" submitIcon={saving ? Loader2 : Plus} />
      </form>
    </PreviewModal>
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

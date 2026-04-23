"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PreviewShell from "../../_components/PreviewShell";
import { financeGateway } from "@/lib/financeGateway";
import {
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  ChevronDown,
  Download,
  Send,
  MoreHorizontal,
  Loader2,
  Check,
  RotateCcw,
  XCircle,
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
function statusChip(row) {
  const today = new Date().toISOString().slice(0, 10);
  if (row.status === "paid") return { cls: "p-chip-success", icon: CheckCircle2, label: "Pago" };
  if (row.status === "canceled") return { cls: "p-chip-neutral", icon: Clock, label: "Cancelado" };
  if (row.status === "pending" && row.due_date && row.due_date < today) {
    const days = row.days_overdue || 0;
    return { cls: "p-chip-danger", icon: AlertCircle, label: `Atraso ${days}d` };
  }
  return { cls: "p-chip-neutral", icon: Clock, label: "Pendente" };
}

const FILTERS = [
  { key: "all",      label: "Todos" },
  { key: "paid",     label: "Pagos" },
  { key: "pending",  label: "Pendentes" },
  { key: "overdue",  label: "Em atraso" },
];

export default function MensalidadesPreview() {
  const [ym, setYm] = useState(currentYm());
  const [rows, setRows] = useState([]);
  const [kpis, setKpis] = useState({ receita_a_receber: 0, receita_recebida: 0, receita_atrasada: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      setError(null);
      const res = await financeGateway.listPayments({ ym });
      setRows(Array.isArray(res?.rows) ? res.rows : []);
      setKpis(res?.kpis || { receita_a_receber: 0, receita_recebida: 0, receita_atrasada: 0 });
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

  async function handleMarkPaid(id) {
    try {
      setBusyId(id);
      await financeGateway.markPaid(id);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }
  async function handleReopen(id) {
    try {
      setBusyId(id);
      await financeGateway.reopenPayment(id);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }
  async function handleCancel(id) {
    const note = window.prompt("Motivo do cancelamento (opcional):") ?? undefined;
    if (note === undefined) return;
    try {
      setBusyId(id);
      await financeGateway.cancelPayment(id, note || null);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (term) {
        const name = String(r.student_name || "").toLowerCase();
        if (!name.includes(term)) return false;
      }
      if (filter === "all") return true;
      if (filter === "paid") return r.status === "paid";
      if (filter === "pending") return r.status === "pending" && (!r.due_date || r.due_date >= today);
      if (filter === "overdue") return r.status === "pending" && r.due_date && r.due_date < today;
      return true;
    });
  }, [rows, q, filter]);

  const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0);

  function handleExport() {
    if (rows.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const header = ["Aluno", "Vencimento", "Valor", "Pago em", "Status"];
    const data = filtered.map((r) => {
      let status = "Pendente";
      if (r.status === "paid") status = "Pago";
      else if (r.status === "canceled") status = "Cancelado";
      else if (r.due_date && String(r.due_date).slice(0, 10) < today) status = `Atraso ${r.days_overdue || 0}d`;
      return [
        r.student_name || "",
        r.due_date ? String(r.due_date).slice(0, 10) : "",
        Number(r.amount || 0).toFixed(2),
        r.paid_at ? String(r.paid_at).slice(0, 10) : "",
        status,
      ];
    });
    const csv = [header, ...data]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mensalidades-${ym}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleSendReminders() {
    try {
      setError(null);
      const today = new Date().toISOString().slice(0, 10);
      const overdue = rows.filter(
        (r) => r.status === "pending" && r.due_date && String(r.due_date).slice(0, 10) < today
      );
      if (overdue.length === 0) {
        alert("Nenhuma mensalidade em atraso.");
        return;
      }
      const students = await financeGateway.listStudents();
      const emailById = new Map();
      for (const s of students || []) {
        if (s.id && s.email) emailById.set(s.id, s.email);
      }
      const emails = overdue
        .map((r) => emailById.get(r.student_id))
        .filter(Boolean);
      if (emails.length === 0) {
        alert(
          `${overdue.length} mensalidade(s) em atraso, mas nenhum aluno com e-mail cadastrado.`
        );
        return;
      }
      const subject = encodeURIComponent(`Lembrete: mensalidade em atraso — ${ymLabel(ym)}`);
      const body = encodeURIComponent(
        "Olá,\n\nIdentificamos que sua mensalidade está em atraso. " +
          "Por favor, regularize o pagamento assim que possível.\n\n" +
          "Em caso de dúvidas, entre em contato.\n\nObrigado."
      );
      const bcc = emails.join(",");
      window.location.href = `mailto:?bcc=${bcc}&subject=${subject}&body=${body}`;
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  return (
    <PreviewShell
      active="financeiro"
      crumb="Financeiro"
      title="Mensalidades"
      rightAction={
        <div className="flex items-center gap-2">
          <button
            className="p-btn p-btn-ghost hidden sm:inline-flex"
            onClick={handleExport}
            disabled={loading || rows.length === 0}
          >
            <Download className="h-4 w-4" />
            <span>Exportar</span>
          </button>
          <button
            className="p-btn p-btn-primary"
            onClick={handleSendReminders}
            disabled={loading}
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Enviar lembretes</span>
          </button>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Mensalidades</h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading ? "Carregando…" : `${ymLabel(ym)} · ${rows.length} lançamentos · ${money(total)} no total`}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3 md:gap-4">
          <SumCard label="A receber" value={money(kpis.receita_a_receber)} />
          <SumCard label="Recebido" value={money(kpis.receita_recebida)} tone="success" />
          <SumCard label="Em atraso" value={money(kpis.receita_atrasada)} tone="danger" />
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--p-text-faint)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar aluno…"
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
              Nenhuma mensalidade no filtro atual.
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--p-border)] bg-[var(--p-surface-2)] text-left text-xs font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                      <th className="px-5 py-3">Aluno</th>
                      <th className="px-5 py-3">Vencimento</th>
                      <th className="px-5 py-3 text-right">Valor</th>
                      <th className="px-5 py-3">Pago em</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--p-border)]">
                    {filtered.map((r) => {
                      const { cls, icon: Icon, label } = statusChip(r);
                      return (
                        <tr key={r.id} className="hover:bg-[var(--p-surface-2)]">
                          <td className="px-5 py-3 font-medium">{r.student_name || "—"}</td>
                          <td className="px-5 py-3 tabular-nums text-[var(--p-text-muted)]">{fdate(r.due_date)}</td>
                          <td className="px-5 py-3 text-right font-semibold tabular-nums">{money(r.amount)}</td>
                          <td className="px-5 py-3 tabular-nums text-[var(--p-text-muted)]">{fdate(r.paid_at)}</td>
                          <td className="px-5 py-3"><span className={`p-chip ${cls}`}><Icon className="h-3 w-3" /> {label}</span></td>
                          <td className="px-5 py-3 text-right">
                            <RowActions
                              row={r}
                              busy={busyId === r.id}
                              onMarkPaid={() => handleMarkPaid(r.id)}
                              onReopen={() => handleReopen(r.id)}
                              onCancel={() => handleCancel(r.id)}
                            />
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
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.student_name || "—"}</div>
                            <div className="text-xs text-[var(--p-text-muted)]">Venc.: {fdate(r.due_date)}</div>
                          </div>
                          <div className="flex items-start gap-2 shrink-0">
                            <div className="text-right">
                              <div className="text-sm font-semibold tabular-nums">{money(r.amount)}</div>
                              <span className={`p-chip ${cls} mt-1`}><Icon className="h-3 w-3" /> {label}</span>
                            </div>
                            <RowActions
                              row={r}
                              busy={busyId === r.id}
                              onMarkPaid={() => handleMarkPaid(r.id)}
                              onReopen={() => handleReopen(r.id)}
                              onCancel={() => handleCancel(r.id)}
                            />
                          </div>
                        </div>
                        {r.paid_at && (
                          <div className="mt-1 text-[11px] text-[var(--p-text-faint)]">Pago em {fdate(r.paid_at)}</div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </PreviewShell>
  );
}

function ymLabel(ym) {
  const [y, m] = String(ym || "").split("-");
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const idx = Math.max(1, Math.min(12, Number(m || 0))) - 1;
  return `${names[idx]} de ${y}`;
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

function RowActions({ row, busy, onMarkPaid, onReopen, onCancel }) {
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

  const canMarkPaid = row.status === "pending";
  const canReopen = row.status === "paid" || row.status === "canceled";
  const canCancel = row.status !== "canceled";

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
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] shadow-lg">
          {canMarkPaid && (
            <button
              type="button"
              onClick={() => run(onMarkPaid)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--p-surface-2)]"
            >
              <Check className="h-4 w-4 text-[var(--p-success)]" /> Marcar como pago
            </button>
          )}
          {canReopen && (
            <button
              type="button"
              onClick={() => run(onReopen)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--p-surface-2)]"
            >
              <RotateCcw className="h-4 w-4 text-[var(--p-text-muted)]" /> Reabrir
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              onClick={() => run(onCancel)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--p-danger)] hover:bg-[var(--p-danger-50)]"
            >
              <XCircle className="h-4 w-4" /> Cancelar
            </button>
          )}
        </div>
      )}
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

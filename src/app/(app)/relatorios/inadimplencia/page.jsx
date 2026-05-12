// src/app/(app)/relatorios/inadimplencia/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "@/contexts/SessionContext";
import { financeGateway } from "@/lib/financeGateway";
import {
  ArrowLeft,
  AlertCircle,
  Calendar,
  Download,
  Users,
  TrendingDown,
  Clock,
  Receipt,
  Loader2,
  CheckCircle2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────
const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const fmtDateBR = (s) => {
  if (!s) return "—";
  const iso = String(s);
  const safe = iso.length > 10 ? iso.slice(0, 25) : `${iso}T00:00:00`;
  const d = new Date(safe);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
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

const AVATAR_PALETTE = [
  "#8B1C2C", "#E94F37", "#0F766E", "#D97706", "#1E40AF",
  "#7C3AED", "#BE123C", "#0891B2", "#15803D", "#9333EA", "#DC2626", "#059669",
];
function colorFor(name) {
  const s = String(name || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function severityChip(days) {
  if (days <= 0)
    return { cls: "p-chip-neutral", label: "Vence hoje" };
  if (days <= 7) return { cls: "p-chip-warning", label: `${days}d` };
  if (days <= 30) return { cls: "p-chip-warning", label: `${days}d` };
  if (days <= 60) return { cls: "p-chip-danger", label: `${days}d` };
  return { cls: "p-chip-danger", label: `${days}d` };
}

function downloadCSV(filename, rows) {
  if (!rows || rows.length === 0) return;
  const header = Object.keys(rows[0]);
  const csv = [header, ...rows.map((r) => header.map((k) => r[k]))]
    .map((row) =>
      row
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(";")
    )
    .join("\n");
  const bom = "﻿";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ─── Página ──────────────────────────────────────────────────────
export default function RelatorioInadimplenciaPage() {
  const { session } = useSession() || {};
  const tenant_id =
    session?.tenantId || "11111111-1111-4111-8111-111111111111";

  const [ym, setYm] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const { rows: all } = await financeGateway.listPayments({
        ym,
        status: "pending",
        tenant_id,
      });
      const overdue = (all || []).filter((r) => (r.days_overdue || 0) > 0);
      // Ordena por dias em atraso DESC (pior primeiro)
      overdue.sort(
        (a, b) =>
          Number(b.days_overdue || 0) - Number(a.days_overdue || 0)
      );
      setRows(overdue);
    } catch (e) {
      setRows([]);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, tenant_id]);

  // KPIs + aging buckets
  const stats = useMemo(() => {
    const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0);
    const count = rows.length;
    const avgDays =
      count > 0
        ? Math.round(
            rows.reduce((a, r) => a + Number(r.days_overdue || 0), 0) /
              count
          )
        : 0;
    const maxDays =
      count > 0
        ? Math.max(...rows.map((r) => Number(r.days_overdue || 0)))
        : 0;

    // aging buckets
    const buckets = { "1-7": 0, "8-30": 0, "31-60": 0, "60+": 0 };
    const bucketAmounts = { "1-7": 0, "8-30": 0, "31-60": 0, "60+": 0 };
    for (const r of rows) {
      const d = Number(r.days_overdue || 0);
      const amt = Number(r.amount || 0);
      const key = d <= 7 ? "1-7" : d <= 30 ? "8-30" : d <= 60 ? "31-60" : "60+";
      buckets[key]++;
      bucketAmounts[key] += amt;
    }
    return { total, count, avgDays, maxDays, buckets, bucketAmounts };
  }, [rows]);

  // Unique payers count (insight: quantos pagadores diferentes estão devendo)
  const uniquePayers = useMemo(() => {
    const set = new Set();
    for (const r of rows) {
      const k = r.payer_id || r.payer_name_snapshot || r.student_id;
      if (k) set.add(k);
    }
    return set.size;
  }, [rows]);

  function exportCSV() {
    const csvRows = rows.map((r) => ({
      aluno: r.student_name || r.student_name_snapshot || r.student_id || "",
      pagador: r.payer_name || r.payer_name_snapshot || r.payer_id || "",
      competencia: String(r.due_date || "").slice(0, 7),
      vencimento: r.due_date,
      valor: String(r.amount || 0).replace(".", ","),
      dias_em_atraso: r.days_overdue || 0,
    }));
    downloadCSV(`inadimplencia-${ym}.csv`, csvRows);
  }

  return (
    <div className="space-y-6">
      {/* Voltar */}
      <Link
        href="/relatorios"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--p-text-muted)] hover:text-[var(--p-text)]"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para relatórios
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--p-text-faint)]">
            Relatório
          </div>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight md:text-3xl">
            Inadimplência
          </h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            Mensalidades pendentes e vencidas em {ymLabel(ym)}.
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={rows.length === 0 || loading}
          className="p-btn p-btn-ghost self-start sm:self-auto"
        >
          <Download className="h-4 w-4" />
          <span>Exportar CSV</span>
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm">
          <Calendar className="h-4 w-4 text-[var(--p-text-muted)]" />
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            className="bg-transparent text-sm focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          {error}
        </div>
      )}

      {/* Conteúdo */}
      {loading ? (
        <div className="p-card flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando relatório…
        </div>
      ) : rows.length === 0 && !error ? (
        <div className="p-card flex flex-col items-center justify-center gap-3 px-5 py-14 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--p-success-50)] text-[var(--p-success)]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <div className="text-sm font-semibold">
              Sem inadimplência neste mês
            </div>
            <div className="mt-1 text-xs text-[var(--p-text-muted)]">
              Nenhuma mensalidade pendente venceu até hoje. 🎉
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* KPIs principais */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <StatCard
              icon={TrendingDown}
              label="Total em atraso"
              value={fmtBRL(stats.total)}
              sub={`${stats.count} ${
                stats.count === 1 ? "boleto" : "boletos"
              }`}
              tone="danger"
            />
            <StatCard
              icon={Receipt}
              label="Boletos vencidos"
              value={stats.count}
              sub={`média ${fmtBRL(
                stats.count > 0 ? stats.total / stats.count : 0
              )} por boleto`}
              tone="warning"
            />
            <StatCard
              icon={Users}
              label="Pagadores"
              value={uniquePayers}
              sub={`${uniquePayers === 1 ? "responsável" : "responsáveis"} diferentes`}
              tone="primary"
            />
            <StatCard
              icon={Clock}
              label="Atraso médio"
              value={`${stats.avgDays}d`}
              sub={
                stats.maxDays > 0
                  ? `máx. ${stats.maxDays}d`
                  : "—"
              }
              tone={
                stats.avgDays > 30
                  ? "danger"
                  : stats.avgDays > 7
                  ? "warning"
                  : "neutral"
              }
            />
          </section>

          {/* Aging buckets */}
          <section className="p-card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[var(--p-border)] px-5 py-4">
              <Clock className="h-4 w-4 text-[var(--p-text-muted)]" />
              <h2 className="text-sm font-semibold">Distribuição por atraso</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4 md:gap-4">
              {[
                { key: "1-7", label: "1–7 dias", tone: "warning" },
                { key: "8-30", label: "8–30 dias", tone: "warning" },
                { key: "31-60", label: "31–60 dias", tone: "danger" },
                { key: "60+", label: "60+ dias", tone: "danger" },
              ].map((b) => {
                const count = stats.buckets[b.key];
                const amount = stats.bucketAmounts[b.key];
                const pct =
                  stats.count > 0
                    ? Math.round((count / stats.count) * 100)
                    : 0;
                const toneCls =
                  b.tone === "danger"
                    ? "text-[var(--p-danger)]"
                    : "text-[var(--p-warning)]";
                const barCls =
                  b.tone === "danger"
                    ? "bg-[var(--p-danger)]"
                    : "bg-[var(--p-warning)]";
                return (
                  <div
                    key={b.key}
                    className="rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-2)] p-3"
                  >
                    <div className="text-xs uppercase tracking-wider text-[var(--p-text-faint)]">
                      {b.label}
                    </div>
                    <div
                      className={`p-kpi-value mt-1 text-lg ${toneCls}`}
                    >
                      {count}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--p-text-muted)] tabular-nums">
                      {fmtBRL(amount)}
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--p-surface)]">
                      <div
                        className={`h-full rounded-full ${barCls}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Lista detalhada */}
          <div className="p-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--p-border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-[var(--p-text-muted)]" />
                <h2 className="text-sm font-semibold">Mensalidades em atraso</h2>
                <span className="p-chip p-chip-neutral">{rows.length}</span>
              </div>
            </div>

            {/* Tabela desktop */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--p-border)] bg-[var(--p-surface-2)] text-left text-xs font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                    <th className="px-5 py-3">Aluno</th>
                    <th className="px-5 py-3">Pagador</th>
                    <th className="px-5 py-3">Vencimento</th>
                    <th className="px-5 py-3 text-right">Valor</th>
                    <th className="px-5 py-3 text-right">Atraso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--p-border)]">
                  {rows.map((r) => {
                    const days = Number(r.days_overdue || 0);
                    const sev = severityChip(days);
                    const studentName =
                      r.student_name || r.student_name_snapshot || "—";
                    const payerName =
                      r.payer_name || r.payer_name_snapshot || "—";
                    return (
                      <tr
                        key={r.id}
                        className="hover:bg-[var(--p-surface-2)]"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
                              style={{ background: colorFor(studentName) }}
                            >
                              {String(studentName).slice(0, 1).toUpperCase()}
                            </div>
                            <span className="font-medium truncate">
                              {studentName}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-[var(--p-text-muted)]">
                          {payerName}
                        </td>
                        <td className="px-5 py-3 tabular-nums text-[var(--p-text-muted)]">
                          {fmtDateBR(r.due_date)}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums text-[var(--p-danger)]">
                          {fmtBRL(r.amount)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className={`p-chip ${sev.cls}`}>
                            {sev.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Lista mobile */}
            <ul className="divide-y divide-[var(--p-border)] md:hidden">
              {rows.map((r) => {
                const days = Number(r.days_overdue || 0);
                const sev = severityChip(days);
                const studentName =
                  r.student_name || r.student_name_snapshot || "—";
                const payerName =
                  r.payer_name || r.payer_name_snapshot || "—";
                return (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                      style={{ background: colorFor(studentName) }}
                    >
                      {String(studentName).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{studentName}</div>
                      <div className="text-xs text-[var(--p-text-muted)] truncate">
                        {payerName}
                      </div>
                      <div className="text-[11px] text-[var(--p-text-faint)] tabular-nums">
                        Venc. {fmtDateBR(r.due_date)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums text-[var(--p-danger)]">
                        {fmtBRL(r.amount)}
                      </div>
                      <span className={`p-chip ${sev.cls} mt-1`}>
                        {sev.label}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, tone }) {
  const toneCls =
    tone === "primary"
      ? "bg-[var(--p-primary-50)] text-[var(--p-primary)]"
      : tone === "success"
      ? "bg-[var(--p-success-50)] text-[var(--p-success)]"
      : tone === "warning"
      ? "bg-[var(--p-warning-50)] text-[var(--p-warning)]"
      : tone === "danger"
      ? "bg-[var(--p-danger-50)] text-[var(--p-danger)]"
      : "bg-[var(--p-surface-2)] text-[var(--p-text)]";
  return (
    <div className="p-card p-card-hover flex flex-col gap-3 p-4 md:p-5">
      <div className={`grid h-9 w-9 place-items-center rounded-lg ${toneCls}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs text-[var(--p-text-muted)]">{label}</div>
        <div className="p-kpi-value mt-1 text-2xl md:text-[26px]">{value}</div>
        {sub && (
          <div className="mt-0.5 text-xs text-[var(--p-text-faint)]">{sub}</div>
        )}
      </div>
    </div>
  );
}

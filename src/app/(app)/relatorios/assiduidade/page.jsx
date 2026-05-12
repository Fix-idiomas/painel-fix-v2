"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { financeGateway } from "@/lib/financeGateway";
import {
  ArrowLeft,
  Calendar,
  Download,
  Users,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Loader2,
  BookOpen,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────
const ymNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

function rateChip(rate) {
  if (!Number.isFinite(rate))
    return { cls: "p-chip-neutral", label: "—" };
  const pct = Math.round(rate * 100);
  const cls =
    pct >= 80
      ? "p-chip-success"
      : pct >= 50
      ? "p-chip-warning"
      : "p-chip-danger";
  return { cls, label: `${pct}%` };
}

// ─── Página exportada (envolve em Suspense) ──────────────────────
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 p-6 text-sm text-[var(--p-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      }
    >
      <AssiduidadeInner />
    </Suspense>
  );
}

export const dynamic = "force-dynamic";

// ─── Conteúdo ────────────────────────────────────────────────────
function AssiduidadeInner() {
  const search = useSearchParams();
  const router = useRouter();

  const [turmas, setTurmas] = useState([]);
  const [ym, setYm] = useState(search.get("ym") || ymNow());
  const [turmaId, setTurmaId] = useState(search.get("turma") || "all");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // carrega turmas 1x
  useEffect(() => {
    financeGateway
      .listTurmas()
      .then((t) => setTurmas(Array.isArray(t) ? t : []))
      .catch((e) => setError(e?.message || String(e)));
  }, []);

  // ao mudar filtro: atualiza querystring + recarrega
  useEffect(() => {
    const params = new URLSearchParams();
    if (ym) params.set("ym", ym);
    if (turmaId && turmaId !== "all") params.set("turma", turmaId);
    router.replace(`/relatorios/assiduidade?${params.toString()}`);
    buildReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, turmaId]);

  async function buildReport() {
    try {
      setError(null);
      setLoading(true);
      const allTurmas = await financeGateway.listTurmas();
      const ts =
        turmaId === "all"
          ? allTurmas
          : allTurmas.filter((t) => t.id === turmaId);
      const all = [];
      for (const t of ts) {
        const turmaRows = await reportForTurma(t, ym);
        all.push(...turmaRows);
      }
      setRows(all);
    } catch (e) {
      setError(e?.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // KPIs agregados
  const stats = useMemo(() => {
    const totalStudents = rows.length;
    const totalPresents = rows.reduce((a, r) => a + r.presents, 0);
    const totalAbsents = rows.reduce((a, r) => a + r.absents, 0);
    const totalSessions = totalPresents + totalAbsents;
    const ratesWithData = rows.filter((r) => r.total > 0).map((r) => r.rate);
    const avgRate =
      ratesWithData.length > 0
        ? ratesWithData.reduce((a, r) => a + r, 0) / ratesWithData.length
        : null;
    const turmasCount = new Set(rows.map((r) => r.turma_id)).size;
    return {
      totalStudents,
      totalSessions,
      totalPresents,
      totalAbsents,
      avgRate,
      turmasCount,
    };
  }, [rows]);

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
            Assiduidade
          </h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${ymLabel(ym)} · ${stats.totalStudents} alunos · ${stats.turmasCount} ${
                  stats.turmasCount === 1 ? "turma" : "turmas"
                }`}
          </p>
        </div>
        <button
          onClick={() => exportCSV(rows, ym, turmaId)}
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
        <select
          value={turmaId}
          onChange={(e) => setTurmaId(e.target.value)}
          className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40 sm:w-64"
        >
          <option value="all">Todas as turmas</option>
          {turmas.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          {error}
        </div>
      )}

      {/* KPIs */}
      {!loading && rows.length > 0 && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <StatCard
            icon={Users}
            label="Alunos"
            value={stats.totalStudents}
            sub={`${stats.turmasCount} ${
              stats.turmasCount === 1 ? "turma" : "turmas"
            }`}
            tone="primary"
          />
          <StatCard
            icon={CheckCircle2}
            label="Presenças"
            value={stats.totalPresents}
            sub={`${stats.totalSessions} registros`}
            tone="success"
          />
          <StatCard
            icon={XCircle}
            label="Ausências"
            value={stats.totalAbsents}
            sub={
              stats.totalSessions > 0
                ? `${Math.round(
                    (stats.totalAbsents / stats.totalSessions) * 100
                  )}% do total`
                : "—"
            }
            tone="danger"
          />
          <StatCard
            icon={TrendingUp}
            label="Assiduidade média"
            value={
              stats.avgRate !== null
                ? `${Math.round(stats.avgRate * 100)}%`
                : "—"
            }
            sub="média entre os alunos"
            tone={
              stats.avgRate === null
                ? "neutral"
                : stats.avgRate >= 0.8
                ? "success"
                : stats.avgRate >= 0.5
                ? "warning"
                : "danger"
            }
          />
        </section>
      )}

      {/* Tabela agrupada */}
      {loading ? (
        <div className="p-card flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando relatório…
        </div>
      ) : rows.length === 0 && !error ? (
        <div className="p-card flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--p-surface-2)] text-[var(--p-text-muted)]">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium">
            Sem registros para este filtro
          </div>
          <div className="text-xs text-[var(--p-text-muted)]">
            Verifique se há aulas com presença marcada no mês selecionado.
          </div>
        </div>
      ) : (
        <GroupedTable rows={rows} />
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

// ─── Tabela agrupada por turma ──────────────────────────────────
function GroupedTable({ rows }) {
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r.turma_id))
        m.set(r.turma_id, { name: r.turma_name, items: [] });
      m.get(r.turma_id).items.push(r);
    }
    return [...m.entries()].sort((a, b) =>
      (a[1].name || "").localeCompare(b[1].name || "")
    );
  }, [rows]);

  return (
    <div className="space-y-5">
      {groups.map(([tid, g]) => {
        const total = g.items.reduce((a, r) => a + r.total, 0);
        const presents = g.items.reduce((a, r) => a + r.presents, 0);
        const turmaRate = total > 0 ? presents / total : null;
        const { cls, label } = rateChip(turmaRate);
        return (
          <section key={tid} className="p-card overflow-hidden">
            <div
              className="h-1.5"
              style={{ background: colorFor(g.name) }}
            />
            <div className="flex items-center justify-between border-b border-[var(--p-border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[var(--p-text-muted)]" />
                <h2 className="text-sm font-semibold">{g.name}</h2>
                <span className="p-chip p-chip-neutral">
                  {g.items.length} {g.items.length === 1 ? "aluno" : "alunos"}
                </span>
              </div>
              <span className={`p-chip ${cls}`}>{label}</span>
            </div>

            {/* Tabela desktop */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--p-border)] bg-[var(--p-surface-2)] text-left text-xs font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                    <th className="px-5 py-3">Aluno</th>
                    <th className="px-5 py-3 text-right">Presenças</th>
                    <th className="px-5 py-3 text-right">Ausências</th>
                    <th className="px-5 py-3 text-right">Total</th>
                    <th className="px-5 py-3 text-right">Assiduidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--p-border)]">
                  {[...g.items]
                    .sort((a, b) =>
                      String(a.student_name || "").localeCompare(
                        b.student_name || ""
                      )
                    )
                    .map((r) => {
                      const rate = rateChip(r.total > 0 ? r.rate : null);
                      return (
                        <tr
                          key={r.student_id}
                          className="hover:bg-[var(--p-surface-2)]"
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div
                                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
                                style={{ background: colorFor(r.student_name) }}
                              >
                                {String(r.student_name || "?")
                                  .slice(0, 1)
                                  .toUpperCase()}
                              </div>
                              <span className="font-medium truncate">
                                {r.student_name}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums">
                            {r.presents}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-[var(--p-text-muted)]">
                            {r.absents}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums">
                            {r.total}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className={`p-chip ${rate.cls}`}>
                              {rate.label}
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
              {[...g.items]
                .sort((a, b) =>
                  String(a.student_name || "").localeCompare(
                    b.student_name || ""
                  )
                )
                .map((r) => {
                  const rate = rateChip(r.total > 0 ? r.rate : null);
                  return (
                    <li
                      key={r.student_id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                        style={{ background: colorFor(r.student_name) }}
                      >
                        {String(r.student_name || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {r.student_name}
                        </div>
                        <div className="text-xs text-[var(--p-text-muted)] tabular-nums">
                          {r.presents}P · {r.absents}A · total {r.total}
                        </div>
                      </div>
                      <span className={`p-chip ${rate.cls} shrink-0`}>
                        {rate.label}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ─── Cálculo do relatório ────────────────────────────────────────
async function reportForTurma(turma, ym) {
  const ymKey = (ym || "").slice(0, 7);
  const sessions = (await financeGateway.listSessions(turma.id)).filter(
    (s) => (s.date || "").slice(0, 7) === ymKey
  );
  const members = await financeGateway.listTurmaMembers(turma.id);
  const map = new Map();
  for (const m of members) {
    map.set(m.id, { name: m.name, presents: 0, absents: 0 });
  }
  const allAtt = await Promise.all(
    sessions.map((s) => financeGateway.listAttendance(s.id))
  );
  for (const list of allAtt) {
    for (const a of list) {
      const e =
        map.get(a.student_id) || {
          name: a.student_name_snapshot || "(Aluno)",
          presents: 0,
          absents: 0,
        };
      if (a.present === true) e.presents += 1;
      else if (a.present === false) e.absents += 1;
      map.set(a.student_id, e);
    }
  }
  const out = [];
  for (const [student_id, v] of map.entries()) {
    const total = v.presents + v.absents;
    const rate = total > 0 ? v.presents / total : 0;
    out.push({
      turma_id: turma.id,
      turma_name: turma.name,
      student_id,
      student_name: v.name,
      presents: v.presents,
      absents: v.absents,
      total,
      rate,
    });
  }
  return out;
}

// ─── CSV export (UTF-8 BOM) ──────────────────────────────────────
function exportCSV(rows, ym, turmaId) {
  if (rows.length === 0) return;
  const header = [
    "Turma",
    "Aluno",
    "Presenças",
    "Ausências",
    "Total",
    "Assiduidade (%)",
  ];
  const data = rows.map((r) => [
    r.turma_name,
    r.student_name,
    r.presents,
    r.absents,
    r.total,
    (r.rate * 100).toFixed(1).replace(".", ","),
  ]);
  const csv = [header, ...data]
    .map((row) =>
      row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")
    )
    .join("\n");
  const bom = "﻿";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assiduidade_${ym}${
    turmaId === "all" ? "" : `_${turmaId}`
  }.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PreviewShell from "../_components/PreviewShell";
import { financeGateway } from "@/lib/financeGateway";
import {
  BookOpen,
  Calendar,
  CreditCard,
  DollarSign,
  Plus,
  TrendingUp,
  TrendingDown,
  Users,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Loader2,
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
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function percentDelta(curr, prev) {
  if (!Number.isFinite(prev) || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}
function longDate() {
  const d = new Date();
  const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${dayNames[d.getDay()]}, ${d.getDate()} de ${monthNames[d.getMonth()]}`;
}

function statusOfRevenue(r, today) {
  if (r.status === "paid") return "paid";
  if (r.status === "canceled") return "canceled";
  if (r.status === "pending" && r.due_date && String(r.due_date).slice(0, 10) < today) return "overdue";
  return "pending";
}

function buildClassesForToday(turmas, teacherMap) {
  const today = new Date();
  const dow = today.getDay(); // 0..6
  const out = [];
  for (const t of turmas || []) {
    const rules = Array.isArray(t.meeting_rules) ? t.meeting_rules : [];
    for (const r of rules) {
      if (Number(r.weekday) !== dow) continue;
      const time = String(r.time || t.meeting_time || "08:00").slice(0, 5);
      const dur = Math.max(0.25, Number(r.duration_hours || 1));
      const mins = Math.round(dur * 60);
      out.push({
        id: `${t.id}-${r.weekday}-${time}`,
        time,
        title: t.name || "—",
        room: t.room || "—",
        teacher: t.teacher_id ? teacherMap[t.teacher_id] || "—" : "Sem professor",
        duration: `${mins} min`,
      });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

function buildRecentActivity(payments, expenses, revenues) {
  const today = todayISO();
  const items = [];
  for (const p of payments || []) {
    if (p.status === "paid" && p.paid_at) {
      items.push({
        when: p.paid_at,
        tag: "payment",
        who: p.student_name || "—",
        what: `pagou ${money(p.amount)}`,
        sort: String(p.paid_at),
      });
    } else if (p.status === "pending" && p.due_date && String(p.due_date).slice(0, 10) < today) {
      const days = Number(p.days_overdue || 0);
      items.push({
        when: p.due_date,
        tag: "overdue",
        who: p.student_name || "—",
        what: days > 0 ? `mensalidade em atraso há ${days}d` : "mensalidade em atraso",
        sort: String(p.due_date),
      });
    }
  }
  for (const e of expenses || []) {
    if (e.status === "paid" && e.paid_at) {
      items.push({
        when: e.paid_at,
        tag: "expense",
        who: e.title_snapshot || e.title || "Despesa",
        what: `pago ${money(e.amount)}`,
        sort: String(e.paid_at),
      });
    }
  }
  for (const r of revenues || []) {
    if (r.status === "paid" && r.paid_at) {
      items.push({
        when: r.paid_at,
        tag: "revenue",
        who: r.title || "Receita",
        what: `recebido ${money(r.amount)}`,
        sort: String(r.paid_at),
      });
    }
  }
  return items.sort((a, b) => b.sort.localeCompare(a.sort)).slice(0, 6);
}

function tagChip(tag) {
  switch (tag) {
    case "payment": return { cls: "p-chip-success", icon: CheckCircle2, label: "Pagamento" };
    case "revenue": return { cls: "p-chip-success", icon: CheckCircle2, label: "Receita" };
    case "expense": return { cls: "p-chip-neutral", icon: CreditCard, label: "Despesa" };
    case "overdue": return { cls: "p-chip-danger",  icon: AlertCircle, label: "Atraso" };
    default: return { cls: "p-chip-neutral", icon: Clock, label: tag };
  }
}

function fmtRelative(iso) {
  if (!iso) return "—";
  const when = new Date(String(iso).slice(0, 10));
  if (Number.isNaN(when.getTime())) return "—";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const w = new Date(when); w.setHours(0, 0, 0, 0);
  const diff = Math.round((today - w) / 86400000);
  if (diff === 0) return "hoje";
  if (diff === 1) return "ontem";
  if (diff > 1 && diff < 7) return `há ${diff} dias`;
  return when.toLocaleDateString("pt-BR");
}

export default function DashboardPreview() {
  const [ym] = useState(currentYm());
  const [students, setStudents] = useState([]);
  const [turmas, setTurmas] = useState([]);
  const [teacherMap, setTeacherMap] = useState({});
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [revenues, setRevenues] = useState([]);
  const [currKpis, setCurrKpis] = useState({ recebido: 0, a_receber: 0, atrasado: 0 });
  const [prevKpis, setPrevKpis] = useState({ recebido: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const prevYm = previousYm(ym);
        const [stu, tu, teachers, pay, exp, rev, curr, prev] = await Promise.all([
          financeGateway.listStudents(),
          financeGateway.listTurmas(),
          financeGateway.listTeachers(),
          financeGateway.listPayments({ ym }),
          financeGateway.listExpenseEntries({ ym }),
          financeGateway.listOtherRevenues({ ym }),
          financeGateway.getCombinedRevenueKpis({ ym }),
          financeGateway.getCombinedRevenueKpis({ ym: prevYm }),
        ]);
        if (cancelled) return;
        setStudents(Array.isArray(stu) ? stu : []);
        setTurmas(Array.isArray(tu) ? tu : []);
        const map = {};
        for (const t of teachers || []) map[t.id] = t.name;
        setTeacherMap(map);
        setPayments(Array.isArray(pay?.rows) ? pay.rows : []);
        setExpenses(Array.isArray(exp?.rows) ? exp.rows : []);
        setRevenues(Array.isArray(rev) ? rev : Array.isArray(rev?.rows) ? rev.rows : []);
        setCurrKpis(curr || { recebido: 0, a_receber: 0, atrasado: 0 });
        setPrevKpis(prev || { recebido: 0 });
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ym]);

  const firstName = useMemo(() => {
    // Try to read a display name from students list would be wrong — just fallback to generic
    return "";
  }, []);

  const todayClasses = useMemo(() => buildClassesForToday(turmas, teacherMap), [turmas, teacherMap]);
  const recent = useMemo(() => buildRecentActivity(payments, expenses, revenues), [payments, expenses, revenues]);

  const today = todayISO();
  const overdueCount = payments.filter((p) => statusOfRevenue(p, today) === "overdue").length;
  const paidOnTime = payments.filter((p) => p.status === "paid").length;
  const paidPct = payments.length ? Math.round((paidOnTime / payments.length) * 100) : 0;
  const activeStudents = students.filter((s) => s.status === "ativo").length;

  const recebido = Number(currKpis?.recebido || 0);
  const prevRecebido = Number(prevKpis?.recebido || 0);
  const delta = percentDelta(recebido, prevRecebido);

  const gross = recebido + Number(currKpis?.a_receber || 0) + Number(currKpis?.atrasado || 0);

  const kpis = [
    {
      label: "Receita do mês",
      value: money(gross),
      delta: delta !== null ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1).replace(".", ",")}%` : "—",
      trend: delta === null ? null : delta >= 0 ? "up" : "down",
      icon: DollarSign,
      hint: "vs. mês anterior",
    },
    {
      label: "Pagamentos em dia",
      value: `${paidPct}%`,
      delta: `${paidOnTime}/${payments.length || 0}`,
      trend: null,
      icon: CheckCircle2,
      hint: "mensalidades pagas",
    },
    {
      label: "Em atraso",
      value: String(overdueCount),
      delta: money(currKpis?.atrasado || 0),
      trend: overdueCount > 0 ? "down" : null,
      icon: AlertCircle,
      hint: "pendentes",
    },
    {
      label: "Alunos ativos",
      value: String(activeStudents),
      delta: `${students.length} total`,
      trend: null,
      icon: Users,
      hint: "este mês",
    },
  ];

  // Revenue sparkline — just use 12 buckets scaled off paid vs expected per day, or a simple flat+growth
  const sparkBars = useMemo(() => {
    if (payments.length === 0) return Array(12).fill(10);
    const perDay = new Array(31).fill(0);
    for (const p of payments) {
      const when = String(p.paid_at || p.due_date || "").slice(8, 10);
      const idx = Number(when) - 1;
      if (idx >= 0 && idx < 31) perDay[idx] += Number(p.amount || 0);
    }
    const bars = [];
    for (let i = 0; i < 12; i++) {
      const start = Math.floor((i * 31) / 12);
      const end = Math.floor(((i + 1) * 31) / 12);
      bars.push(perDay.slice(start, end).reduce((a, b) => a + b, 0));
    }
    const max = Math.max(1, ...bars);
    return bars.map((b) => Math.max(8, Math.round((b / max) * 100)));
  }, [payments]);

  return (
    <PreviewShell
      active="home"
      crumb="Painel"
      title="Início"
      rightAction={
        <button className="p-btn p-btn-primary hidden sm:inline-flex">
          <Plus className="h-4 w-4" />
          <span>Novo</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <section className="mb-8">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--p-text-faint)]">
            {longDate()}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
            {greeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `Você tem ${todayClasses.length} ${todayClasses.length === 1 ? "aula" : "aulas"} hoje e ${overdueCount} ${overdueCount === 1 ? "mensalidade" : "mensalidades"} em atraso.`}
          </p>
        </section>

        {error && (
          <div className="mb-6 rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
            Erro ao carregar painel: {error}
          </div>
        )}

        <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {kpis.map(({ label, value, delta, trend, icon: Icon, hint }) => (
            <div key={label} className="p-card p-card-hover flex flex-col gap-3 p-4 md:p-5">
              <div className="flex items-start justify-between">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--p-primary-50)] text-[var(--p-primary)]">
                  <Icon className="h-4 w-4" />
                </div>
                {trend && (
                  <div className={[
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    trend === "up" ? "bg-[var(--p-success-50)] text-[var(--p-success)]" : "bg-[var(--p-danger-50)] text-[var(--p-danger)]",
                  ].join(" ")}>
                    {trend === "up" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {delta}
                  </div>
                )}
                {!trend && delta && (
                  <span className="text-[11px] text-[var(--p-text-faint)] tabular-nums">{delta}</span>
                )}
              </div>
              <div>
                <div className="text-xs text-[var(--p-text-muted)]">{label}</div>
                <div className="p-kpi-value mt-1 text-2xl md:text-[26px] text-[var(--p-text)]">
                  {loading ? "…" : value}
                </div>
                <div className="mt-0.5 text-xs text-[var(--p-text-faint)]">{hint}</div>
              </div>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <div className="p-card lg:col-span-2">
            <div className="flex items-center justify-between border-b border-[var(--p-border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-[var(--p-text-muted)]" />
                <h2 className="text-sm font-semibold">Aulas de hoje</h2>
                <span className="p-chip p-chip-neutral">{todayClasses.length}</span>
              </div>
              <Link href="/preview/agenda" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--p-primary)] hover:text-[var(--p-primary-600)]">
                Ver agenda <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : todayClasses.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-[var(--p-text-muted)]">
                Sem aulas agendadas para hoje.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--p-border)]">
                {todayClasses.map((c) => (
                  <li key={c.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--p-surface-2)]">
                    <div className="flex w-14 flex-col items-start">
                      <div className="text-sm font-semibold tabular-nums">{c.time}</div>
                      <div className="text-xs text-[var(--p-text-faint)]">{c.duration}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium truncate">{c.title}</div>
                        {c.room && c.room !== "—" && (
                          <span className="p-chip p-chip-neutral">{c.room}</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--p-text-muted)]">
                        Prof. {c.teacher}
                      </div>
                    </div>
                    <button className="hidden sm:inline-flex p-btn p-btn-ghost text-xs h-8 px-3">
                      Registrar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-4 lg:gap-6">
            <div className="p-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Receita — mês atual</h2>
                {delta !== null && (
                  <span className={`p-chip ${delta >= 0 ? "p-chip-success" : "p-chip-danger"}`}>
                    {delta >= 0 ? "+" : ""}{delta.toFixed(0)}%
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-end gap-1 h-20">
                {sparkBars.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm bg-gradient-to-t from-[var(--p-primary)] to-[var(--p-accent)] opacity-80"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <div>
                  <div className="text-xs text-[var(--p-text-muted)]">Recebido</div>
                  <div className="p-kpi-value text-xl">{loading ? "…" : money(recebido)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[var(--p-text-muted)]">A receber</div>
                  <div className="p-kpi-value text-xl text-[var(--p-text-muted)]">
                    {loading ? "…" : money(currKpis?.a_receber || 0)}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-card">
              <div className="flex items-center justify-between border-b border-[var(--p-border)] px-5 py-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[var(--p-text-muted)]" />
                  <h2 className="text-sm font-semibold">Atividade recente</h2>
                </div>
              </div>
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                </div>
              ) : recent.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-[var(--p-text-muted)]">
                  Sem movimentações recentes.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--p-border)]">
                  {recent.map((r, i) => {
                    const { cls, icon: Icon, label } = tagChip(r.tag);
                    return (
                      <li key={i} className="flex items-start gap-3 px-5 py-3">
                        <div className={`p-chip ${cls} shrink-0`}>
                          <Icon className="h-3 w-3" />
                          {label}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm">
                            <span className="font-medium">{r.who}</span>{" "}
                            <span className="text-[var(--p-text-muted)]">{r.what}</span>
                          </div>
                          <div className="mt-0.5 text-xs text-[var(--p-text-faint)]">{fmtRelative(r.when)}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { icon: Users, label: "Novo aluno", href: "/preview/alunos" },
            { icon: CreditCard, label: "Mensalidades", href: "/preview/financeiro/mensalidades" },
            { icon: BookOpen, label: "Turmas", href: "/preview/turmas" },
            { icon: Calendar, label: "Agenda", href: "/preview/agenda" },
          ].map(({ icon: Icon, label, href }) => (
            <Link
              key={label}
              href={href}
              className="p-card p-card-hover flex items-center gap-3 px-4 py-3"
            >
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--p-primary-50)] text-[var(--p-primary)]">
                <Icon className="h-4 w-4" />
              </div>
              <div className="text-sm font-medium">{label}</div>
            </Link>
          ))}
        </section>
      </div>
    </PreviewShell>
  );
}

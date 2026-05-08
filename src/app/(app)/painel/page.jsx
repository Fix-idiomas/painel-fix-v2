"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "@/contexts/SessionContext";
import { financeGateway } from "@/lib/financeGateway";
import { computeRevenueKPIs } from "@/lib/finance";
import { supabase } from "@/lib/supabaseClient";
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
  Wallet,
  Eye,
  EyeOff,
  Mail,
  Cake,
} from "lucide-react";
import AppModal, { FormError, ModalActions } from "@/components/AppModal";

// ─── Helpers ──────────────────────────────────────────────────────
const TZ = "America/Sao_Paulo";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const fmtBRDateDots = (s) => {
  if (!s) return "—";
  const [Y, M, D] = String(s).slice(0, 10).split("-");
  if (!Y || !M || !D) return "—";
  return `${D}.${M}.${Y}`;
};

function ymAddMonths(ym, delta) {
  const [Y, M] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(Y, M - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function previousYm(ym) {
  return ymAddMonths(ym, -1);
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
  const monthNames = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${dayNames[d.getDay()]}, ${d.getDate()} de ${monthNames[d.getMonth()]}`;
}

function statusOfRevenue(r, today) {
  if (r.status === "paid") return "paid";
  if (r.status === "canceled") return "canceled";
  if (
    r.status === "pending" &&
    r.due_date &&
    String(r.due_date).slice(0, 10) < today
  )
    return "overdue";
  return "pending";
}

function buildClassesForToday(turmas, teacherMap) {
  const today = new Date();
  const dow = today.getDay();
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
        who: p.student_name_snapshot || p.student_name || "—",
        what: `pagou ${fmtBRL(p.amount)}`,
        sort: String(p.paid_at),
      });
    } else if (
      p.status === "pending" &&
      p.due_date &&
      String(p.due_date).slice(0, 10) < today
    ) {
      const days = Number(p.days_overdue || 0);
      items.push({
        when: p.due_date,
        tag: "overdue",
        who: p.student_name_snapshot || p.student_name || "—",
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
        what: `pago ${fmtBRL(e.amount)}`,
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
        what: `recebido ${fmtBRL(r.amount)}`,
        sort: String(r.paid_at),
      });
    }
  }
  return items.sort((a, b) => b.sort.localeCompare(a.sort)).slice(0, 6);
}

function tagChip(tag) {
  switch (tag) {
    case "payment":
      return { cls: "p-chip-success", icon: CheckCircle2, label: "Pagamento" };
    case "revenue":
      return { cls: "p-chip-success", icon: CheckCircle2, label: "Receita" };
    case "expense":
      return { cls: "p-chip-neutral", icon: CreditCard, label: "Despesa" };
    case "overdue":
      return { cls: "p-chip-danger", icon: AlertCircle, label: "Atraso" };
    default:
      return { cls: "p-chip-neutral", icon: Clock, label: tag };
  }
}

function fmtRelative(iso) {
  if (!iso) return "—";
  const when = new Date(String(iso).slice(0, 10));
  if (Number.isNaN(when.getTime())) return "—";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const w = new Date(when);
  w.setHours(0, 0, 0, 0);
  const diff = Math.round((today - w) / 86400000);
  if (diff === 0) return "hoje";
  if (diff === 1) return "ontem";
  if (diff > 1 && diff < 7) return `há ${diff} dias`;
  return when.toLocaleDateString("pt-BR");
}

// ─── Página ──────────────────────────────────────────────────────
export default function PainelPage() {
  const { ready, isAdmin, perms } = useSession();
  const canReadFinance = isAdmin || !!perms?.finance?.read;
  const canReadRegistry = isAdmin || !!perms?.registry?.read;

  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7));
  const [showValues, setShowValues] = useState(true);
  const [openMail, setOpenMail] = useState(false);
  const [registering, setRegistering] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Datasets
  const [students, setStudents] = useState([]);
  const [turmas, setTurmas] = useState([]);
  const [teacherMap, setTeacherMap] = useState({});
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [revenues, setRevenues] = useState([]);

  // KPIs
  const [currKpis, setCurrKpis] = useState({ recebido: 0, a_receber: 0, atrasado: 0 });
  const [prevKpis, setPrevKpis] = useState({ recebido: 0 });
  const [expKpis, setExpKpis] = useState({ total: 0, paid: 0, overdue: 0, teachers: 0 });

  // Listas auxiliares
  const [upcoming7d, setUpcoming7d] = useState([]);
  const [payables5d, setPayables5d] = useState([]);
  const [payablesInclPast, setPayablesInclPast] = useState(false);
  const [birthdays, setBirthdays] = useState([]);

  function maskMoney(n) {
    return showValues ? fmtBRL(n) : "•••";
  }
  function maskCount(n) {
    return showValues ? String(n) : "••";
  }

  // Click-outside no dropdown "Novo"
  useEffect(() => {
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target))
        setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  async function load() {
    let alive = true;
    try {
      setLoading(true);
      setError(null);

      const prevYm = previousYm(ym);
      const [
        stuList,
        tuList,
        teacherList,
        paymentsRes,
        expensesRes,
        revenuesRes,
        currKpisRes,
        prevKpisRes,
      ] = await Promise.all([
        canReadRegistry ? financeGateway.listStudents() : Promise.resolve([]),
        canReadRegistry ? financeGateway.listTurmas() : Promise.resolve([]),
        canReadRegistry ? financeGateway.listTeachers() : Promise.resolve([]),
        canReadFinance
          ? financeGateway.listPayments({ ym })
          : Promise.resolve({ rows: [], kpis: {} }),
        canReadFinance
          ? financeGateway.listExpenseEntries({ ym })
          : Promise.resolve({ rows: [], kpis: {} }),
        canReadFinance
          ? financeGateway.listOtherRevenues({ ym })
          : Promise.resolve([]),
        canReadFinance
          ? financeGateway.getCombinedRevenueKpis({ ym })
          : Promise.resolve({ recebido: 0, a_receber: 0, atrasado: 0 }),
        canReadFinance
          ? financeGateway.getCombinedRevenueKpis({ ym: prevYm })
          : Promise.resolve({ recebido: 0 }),
      ]);
      if (!alive) return;

      setStudents(Array.isArray(stuList) ? stuList : []);
      setTurmas(Array.isArray(tuList) ? tuList : []);
      const tMap = {};
      for (const t of teacherList || []) tMap[t.id] = t.name;
      setTeacherMap(tMap);

      const paymentsRows = paymentsRes?.rows || [];
      setPayments(paymentsRows);
      setExpenses(expensesRes?.rows || []);
      setRevenues(
        Array.isArray(revenuesRes)
          ? revenuesRes
          : Array.isArray(revenuesRes?.rows)
          ? revenuesRes.rows
          : []
      );
      setCurrKpis(currKpisRes || { recebido: 0, a_receber: 0, atrasado: 0 });
      setPrevKpis(prevKpisRes || { recebido: 0 });

      // KPIs de despesas + custo professores
      const eK = expensesRes?.kpis || {};
      let teachersTotal = 0;
      if (canReadFinance) {
        try {
          const teacherIds = canReadRegistry
            ? (teacherList || []).map((t) => t.id)
            : [];
          if (teacherIds.length) {
            const payouts = await Promise.all(
              teacherIds.map((tid) =>
                financeGateway.sumTeacherPayoutByMonth(tid, ym)
              )
            );
            teachersTotal = payouts.reduce(
              (acc, it) => acc + Number(it?.amount || 0),
              0
            );
          }
        } catch {
          /* keep 0 */
        }
      }
      setExpKpis({
        total: Number(eK.total || 0),
        paid: Number(eK.paid || 0),
        overdue: Number(eK.overdue || 0),
        teachers: teachersTotal,
      });

      // Próximos 7 dias (vencimentos de mensalidades)
      const nowSP = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
      const todaySP = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(
        nowSP
      );
      const plus7 = new Date(nowSP);
      plus7.setDate(plus7.getDate() + 7);
      const end7 = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(
        plus7
      );

      let rows7 = [];
      if (canReadFinance) {
        try {
          const { data } = await supabase
            .from("payments")
            .select(
              "id, student_id, payer_id, student_name_snapshot, payer_name_snapshot, amount, due_date, status"
            )
            .eq("status", "pending")
            .gte("due_date", todaySP)
            .lte("due_date", end7)
            .order("due_date", { ascending: true })
            .limit(200);
          rows7 = data || [];
        } catch {
          /* ignore */
        }
      }
      const up = rows7
        .map((r) => ({
          id: r.id,
          due_date: r.due_date,
          amount: Number(r.amount || 0),
          student_name: r.student_name_snapshot || "—",
          payer_name: r.payer_name_snapshot || "—",
          isToday: r.due_date === todaySP,
        }))
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
      if (!alive) return;
      setUpcoming7d(up);

      // Contas a pagar (próximos 5 dias)
      const plus5 = new Date(nowSP);
      plus5.setDate(plus5.getDate() + 5);
      const end5 = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(
        plus5
      );
      let rows5 = [];
      let inclPast = false;
      if (canReadFinance) {
        const ymNow = todaySP.slice(0, 7);
        const ymNext = ymAddMonths(ymNow, 1);
        const [eNow, eNext] = await Promise.all([
          financeGateway.listExpenseEntries({ ym: ymNow, status: "pending" }),
          financeGateway.listExpenseEntries({ ym: ymNext, status: "pending" }),
        ]);
        const all = [
          ...(Array.isArray(eNow?.rows) ? eNow.rows : []),
          ...(Array.isArray(eNext?.rows) ? eNext.rows : []),
        ];
        rows5 = all.filter((r) => r?.due_date >= todaySP && r?.due_date <= end5);
        if (!rows5.length) {
          const minus5 = new Date(nowSP);
          minus5.setDate(minus5.getDate() - 5);
          const start5 = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(
            minus5
          );
          rows5 = all.filter(
            (r) => r?.due_date >= start5 && r?.due_date <= end5
          );
          inclPast = rows5.length > 0;
        }
      }
      if (!alive) return;
      setPayables5d(
        rows5
          .map((r) => ({
            id: r.id,
            due_date: r.due_date,
            title: r.title_snapshot || r.title || "—",
            amount: Number(r.amount || 0),
            isToday: r.due_date === todaySP,
            isPast: r.due_date < todaySP,
          }))
          .sort((a, b) => a.due_date.localeCompare(b.due_date))
      );
      setPayablesInclPast(inclPast);

      // Aniversariantes do mês
      const mm = nowSP.getMonth() + 1;
      const bdays = (stuList || [])
        .filter((s) => (s?.status || "").toLowerCase() === "ativo")
        .map((s) => {
          const name = s.full_name ?? s.name ?? "";
          const dob = s.birth_date ?? s.date_of_birth ?? null;
          if (!name || !dob) return null;
          const m = Number(String(dob).slice(5, 7));
          if (m !== mm) return null;
          const d = Number(String(dob).slice(8, 10));
          return { id: s.id, name, dd: d };
        })
        .filter(Boolean)
        .sort((a, b) => a.dd - b.dd);
      if (!alive) return;
      setBirthdays(bdays);
    } catch (e) {
      if (alive) setError(e?.message || String(e));
    } finally {
      if (alive) setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    if (!canReadFinance && !canReadRegistry) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ym, canReadFinance, canReadRegistry]);

  // Reload em foco/visibilidade
  useEffect(() => {
    const onFocus = () => {
      if (canReadFinance || canReadRegistry) load();
    };
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        (canReadFinance || canReadRegistry)
      )
        load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, canReadFinance, canReadRegistry]);

  // Derivados
  const today = todayISO();
  const todayClasses = useMemo(
    () => buildClassesForToday(turmas, teacherMap),
    [turmas, teacherMap]
  );
  const recent = useMemo(
    () => buildRecentActivity(payments, expenses, revenues),
    [payments, expenses, revenues]
  );
  const overdueCount = payments.filter(
    (p) => statusOfRevenue(p, today) === "overdue"
  ).length;
  const paidOnTime = payments.filter((p) => p.status === "paid").length;
  const paidPct = payments.length
    ? Math.round((paidOnTime / payments.length) * 100)
    : 0;
  const activeStudents = students.filter((s) => s.status === "ativo").length;

  const recebido = Number(currKpis?.recebido || 0);
  const prevRecebido = Number(prevKpis?.recebido || 0);
  const delta = percentDelta(recebido, prevRecebido);
  const grossRevenue =
    recebido +
    Number(currKpis?.a_receber || 0) +
    Number(currKpis?.atrasado || 0);

  // Sparkline mensal (12 buckets)
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

  async function handleRegisterClass(c) {
    if (registering) return;
    try {
      setRegistering(c.id);
      setError(null);
      const todayStr = todayISO();
      const [tId] = String(c.id).split("-");
      const dur = parseFloat(String(c.duration).replace(" min", "")) / 60;
      await financeGateway.createSession({
        turma_id: tId,
        date: `${todayStr}T${c.time}:00`,
        duration_hours: Number.isFinite(dur) && dur > 0 ? dur : 1,
      });
      alert(`Aula "${c.title}" registrada.`);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRegistering(null);
    }
  }

  // Gates
  if (!ready) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--p-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Preparando sessão…
      </div>
    );
  }
  if (!canReadFinance && !canReadRegistry) {
    return (
      <div className="p-6 text-sm text-[var(--p-text-muted)]">
        Acesso negado.
      </div>
    );
  }

  // KPI cards (4 unificados)
  const kpiCards = [
    {
      label: "Receita do mês",
      value: maskMoney(grossRevenue),
      delta:
        delta !== null
          ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1).replace(".", ",")}%`
          : "—",
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
      value: maskCount(overdueCount),
      delta: maskMoney(currKpis?.atrasado || 0),
      trend: overdueCount > 0 ? "down" : null,
      icon: AlertCircle,
      hint: "pendentes",
    },
    {
      label: "Alunos ativos",
      value: maskCount(activeStudents),
      delta: `${students.length} total`,
      trend: null,
      icon: Users,
      hint: "este mês",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header com greeting + actions */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--p-text-faint)]">
            {longDate()}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
            {greeting()}
          </h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `Você tem ${todayClasses.length} ${
                  todayClasses.length === 1 ? "aula" : "aulas"
                } hoje${
                  canReadFinance
                    ? ` e ${overdueCount} ${
                        overdueCount === 1 ? "mensalidade" : "mensalidades"
                      } em atraso`
                    : ""
                }.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value.slice(0, 7))}
            className="rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            aria-label="Mês"
          />
          <button
            onClick={() => setShowValues((v) => !v)}
            className="p-btn p-btn-ghost"
            title={showValues ? "Ocultar valores" : "Mostrar valores"}
          >
            {showValues ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {showValues ? "Ocultar" : "Mostrar"}
            </span>
          </button>
          <button onClick={() => setOpenMail(true)} className="p-btn p-btn-ghost">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">E-mail</span>
          </button>
          <div ref={menuRef} className="relative">
            <button
              className="p-btn p-btn-primary"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Plus className="h-4 w-4" />
              <span>Novo</span>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] p-1 shadow-lg"
              >
                {[
                  { icon: Users, label: "Novo aluno", href: "/alunos" },
                  { icon: BookOpen, label: "Nova turma", href: "/turmas" },
                  { icon: Wallet, label: "Novo lançamento", href: "/financeiro" },
                  { icon: Calendar, label: "Nova aula", href: "/agenda" },
                ].map(({ icon: Icon, label, href }) => (
                  <Link
                    key={label}
                    href={href}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--p-text)] hover:bg-[var(--p-surface-2)]"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon className="h-4 w-4 text-[var(--p-text-muted)]" />
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          Erro: {error}
        </div>
      )}

      {/* KPI cards principais */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {kpiCards.map(({ label, value, delta: d, trend, icon: Icon, hint }) => (
          <div
            key={label}
            className="p-card p-card-hover flex flex-col gap-3 p-4 md:p-5"
          >
            <div className="flex items-start justify-between">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--p-primary-50)] text-[var(--p-primary)]">
                <Icon className="h-4 w-4" />
              </div>
              {trend && (
                <div
                  className={[
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    trend === "up"
                      ? "bg-[var(--p-success-50)] text-[var(--p-success)]"
                      : "bg-[var(--p-danger-50)] text-[var(--p-danger)]",
                  ].join(" ")}
                >
                  {trend === "up" ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {d}
                </div>
              )}
              {!trend && d && (
                <span className="text-[11px] text-[var(--p-text-faint)] tabular-nums">
                  {d}
                </span>
              )}
            </div>
            <div>
              <div className="text-xs text-[var(--p-text-muted)]">{label}</div>
              <div className="p-kpi-value mt-1 text-2xl md:text-[26px] text-[var(--p-text)]">
                {loading ? "…" : value}
              </div>
              <div className="mt-0.5 text-xs text-[var(--p-text-faint)]">
                {hint}
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Linha 2: Aulas hoje + Receita sparkline */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="p-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-[var(--p-border)] px-5 py-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[var(--p-text-muted)]" />
              <h2 className="text-sm font-semibold">Aulas de hoje</h2>
              <span className="p-chip p-chip-neutral">
                {todayClasses.length}
              </span>
            </div>
            <Link
              href="/agenda"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--p-primary)] hover:text-[var(--p-primary-600)]"
            >
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
                <li
                  key={c.id}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--p-surface-2)]"
                >
                  <div className="flex w-14 flex-col items-start">
                    <div className="text-sm font-semibold tabular-nums">
                      {c.time}
                    </div>
                    <div className="text-xs text-[var(--p-text-faint)]">
                      {c.duration}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium truncate">
                        {c.title}
                      </div>
                      {c.room && c.room !== "—" && (
                        <span className="p-chip p-chip-neutral">{c.room}</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--p-text-muted)]">
                      Prof. {c.teacher}
                    </div>
                  </div>
                  <button
                    className="hidden sm:inline-flex p-btn p-btn-ghost text-xs h-8 px-3"
                    onClick={() => handleRegisterClass(c)}
                    disabled={registering === c.id}
                  >
                    {registering === c.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Registrar"
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Receita sparkline */}
        {canReadFinance && (
          <div className="p-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Receita — mês atual</h2>
              {delta !== null && (
                <span
                  className={`p-chip ${
                    delta >= 0 ? "p-chip-success" : "p-chip-danger"
                  }`}
                >
                  {delta >= 0 ? "+" : ""}
                  {delta.toFixed(0)}%
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
                <div className="p-kpi-value text-xl">
                  {loading ? "…" : maskMoney(recebido)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-[var(--p-text-muted)]">A receber</div>
                <div className="p-kpi-value text-xl text-[var(--p-text-muted)]">
                  {loading ? "…" : maskMoney(currKpis?.a_receber || 0)}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Linha 3: Próximos 7 dias / Contas a pagar / Aniversariantes */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {canReadFinance && (
          <ListCard
            title="Vencem nos próximos 7 dias"
            icon={DollarSign}
            empty="Nada a vencer no período."
            items={upcoming7d}
            renderItem={(r) => (
              <div className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-[var(--p-text-muted)]">
                      {fmtBRDateDots(r.due_date)}
                    </span>
                    {r.isToday && (
                      <span className="p-chip p-chip-warning">Hoje</span>
                    )}
                  </div>
                  <div className="text-sm font-medium truncate">
                    {r.student_name}
                  </div>
                  <div className="text-xs text-[var(--p-text-faint)] truncate">
                    {r.payer_name}
                  </div>
                </div>
                <div className="text-sm font-semibold tabular-nums">
                  {maskMoney(r.amount)}
                </div>
              </div>
            )}
            loading={loading}
          />
        )}

        {canReadFinance && (
          <ListCard
            title={
              <span>
                Contas a pagar (5 dias)
                {payablesInclPast && (
                  <span className="ml-2 text-[10px] font-normal rounded bg-[var(--p-warning-50)] text-[var(--p-warning)] px-1.5 py-0.5">
                    inclui atrasados
                  </span>
                )}
              </span>
            }
            icon={CreditCard}
            empty="Nada a pagar no período."
            items={payables5d}
            link={{ href: "/financeiro/gastos", label: "Ver todos" }}
            renderItem={(e) => (
              <div className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-[var(--p-text-muted)]">
                      {fmtBRDateDots(e.due_date)}
                    </span>
                    {e.isToday && (
                      <span className="p-chip p-chip-warning">Hoje</span>
                    )}
                    {!e.isToday && e.isPast && (
                      <span className="p-chip p-chip-danger">Atrasado</span>
                    )}
                  </div>
                  <div className="text-sm font-medium truncate">{e.title}</div>
                </div>
                <div className="text-sm font-semibold tabular-nums text-[var(--p-danger)]">
                  −{maskMoney(e.amount)}
                </div>
              </div>
            )}
            loading={loading}
          />
        )}

        {canReadRegistry && (
          <ListCard
            title="Aniversariantes do mês"
            icon={Cake}
            empty="Nenhum aniversariante."
            items={birthdays}
            loading={loading}
            renderItem={(b) => (
              <div className="flex items-center gap-3 px-4 py-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--p-primary-50)] text-[var(--p-primary)] text-xs font-semibold tabular-nums">
                  {String(b.dd).padStart(2, "0")}
                </span>
                <div className="text-sm truncate">{b.name}</div>
              </div>
            )}
          />
        )}
      </section>

      {/* Linha 4: Atividade recente + Resumo de despesas */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="p-card lg:col-span-2">
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
                        <span className="text-[var(--p-text-muted)]">
                          {r.what}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-[var(--p-text-faint)]">
                        {fmtRelative(r.when)}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Resumo despesas / custos */}
        {canReadFinance && (
          <div className="space-y-3">
            <SmallStat
              label="Gastos do mês"
              value={maskMoney(expKpis.total)}
              hint={`${maskMoney(expKpis.paid)} pagos`}
              tone="neutral"
              icon={CreditCard}
            />
            <SmallStat
              label="Em atraso"
              value={maskMoney(expKpis.overdue)}
              hint="despesas vencidas"
              tone="danger"
              icon={AlertCircle}
            />
            <SmallStat
              label="Custo professores"
              value={maskMoney(expKpis.teachers)}
              hint="repasses do mês"
              tone="warning"
              icon={Users}
            />
          </div>
        )}
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { icon: Users, label: "Alunos", href: "/alunos" },
          { icon: CreditCard, label: "Mensalidades", href: "/financeiro/mensalidades" },
          { icon: BookOpen, label: "Turmas", href: "/turmas" },
          { icon: Calendar, label: "Agenda", href: "/agenda" },
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

      {/* Modal: Enviar e-mail */}
      {openMail && (
        <SendMailModal onClose={() => setOpenMail(false)} />
      )}
    </div>
  );
}

// ─── Componentes auxiliares ──────────────────────────────────────
function ListCard({
  title,
  icon: Icon,
  items,
  renderItem,
  empty,
  link,
  loading,
}) {
  return (
    <div className="p-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--p-border)] px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="h-4 w-4 text-[var(--p-text-muted)] shrink-0" />}
          <h2 className="text-sm font-semibold truncate">{title}</h2>
        </div>
        {link && (
          <Link
            href={link.href}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--p-primary)] hover:text-[var(--p-primary-600)]"
          >
            {link.label} <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-[var(--p-text-muted)]">
          <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-[var(--p-text-muted)]">
          {empty}
        </div>
      ) : (
        <ul className="max-h-72 overflow-y-auto divide-y divide-[var(--p-border)]">
          {items.map((it, i) => (
            <li key={it.id || i}>{renderItem(it)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SmallStat({ label, value, hint, tone, icon: Icon }) {
  const toneCls =
    tone === "danger"
      ? "text-[var(--p-danger)]"
      : tone === "warning"
      ? "text-[var(--p-warning)]"
      : tone === "success"
      ? "text-[var(--p-success)]"
      : "text-[var(--p-text)]";
  return (
    <div className="p-card flex items-center gap-3 p-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--p-primary-50)] text-[var(--p-primary)]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-[var(--p-text-muted)]">{label}</div>
        <div className={`p-kpi-value text-lg ${toneCls}`}>{value}</div>
        <div className="text-[11px] text-[var(--p-text-faint)]">{hint}</div>
      </div>
    </div>
  );
}

// ─── Modal: Enviar e-mail ────────────────────────────────────────
function SendMailModal({ onClose }) {
  const [form, setForm] = useState({ to: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    const to = form.to.trim();
    const subject = form.subject.trim();
    const message = form.message.trim();
    if (!to) return setErr("Informe o(s) destinatário(s).");
    if (!subject) return setErr("Informe o assunto.");
    if (!message) return setErr("Escreva a mensagem.");
    try {
      setSending(true);
      const res = await fetch("/api/send-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          html: `<p>${message.replace(/\n/g, "<br/>")}</p>`,
          text: message,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Falha no envio");
      alert("E-mail enviado ✅");
      onClose();
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setSending(false);
    }
  }

  return (
    <AppModal
      title="Enviar e-mail"
      onClose={sending ? () => {} : onClose}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Para * (separe por vírgula)
          </span>
          <input
            value={form.to}
            onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))}
            placeholder="aluno@ex.com, responsavel@ex.com"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Assunto *
          </span>
          <input
            value={form.subject}
            onChange={(e) =>
              setForm((f) => ({ ...f, subject: e.target.value }))
            }
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Mensagem *
          </span>
          <textarea
            value={form.message}
            onChange={(e) =>
              setForm((f) => ({ ...f, message: e.target.value }))
            }
            rows={8}
            placeholder="Escreva sua mensagem…"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <ModalActions
          onCancel={onClose}
          submitting={sending}
          submitLabel="Enviar"
        />
      </form>
    </AppModal>
  );
}

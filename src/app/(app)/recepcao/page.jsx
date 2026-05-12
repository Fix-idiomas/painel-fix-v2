// src/app/(app)/recepcao/page.jsx
// Tela operacional pós-login: o que o usuário precisa fazer hoje.
// Versão anterior (placeholder com logo + saudação) permanece como
// referência em /recepcao-old (não vinculada no nav).
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "@/contexts/SessionContext";
import { financeGateway } from "@/lib/financeGateway";
import { supabaseGateway } from "@/lib/supabaseGateway";
import { supabase } from "@/lib/supabaseClient";
import {
  Calendar,
  Clock,
  Users,
  BookOpen,
  Wallet,
  Mail,
  Plus,
  AlertCircle,
  CheckCircle2,
  Cake,
  ArrowUpRight,
  Sparkles,
  Loader2,
  CalendarCheck,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────
const TZ = "America/Sao_Paulo";

function nowSP() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

function todayISO() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(nowSP());
}

function greeting() {
  const h = nowSP().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function longDate() {
  const d = nowSP();
  const dayNames = [
    "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado",
  ];
  const monthNames = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${dayNames[d.getDay()]}, ${d.getDate()} de ${monthNames[d.getMonth()]}`;
}

function addDaysISO(iso, n) {
  const [Y, M, D] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(Y, M - 1, D + n));
  return d.toISOString().slice(0, 10);
}

function firstName(name) {
  return String(name || "Usuário").trim().split(/\s+/)[0];
}

function buildTodayClasses(turmas, teacherMap, todaySessions, todayDow) {
  const out = [];
  for (const t of turmas || []) {
    const rules = Array.isArray(t.meeting_rules) ? t.meeting_rules : [];
    for (const r of rules) {
      if (Number(r.weekday) !== todayDow) continue;
      const time = String(r.time || t.meeting_time || "08:00").slice(0, 5);
      const dur = Math.max(0.25, Number(r.duration_hours || 1));
      // Já existe sessão registrada hoje pra essa turma?
      const matchingSession = (todaySessions || []).find(
        (s) => s.turma_id === t.id
      );
      out.push({
        key: `${t.id}-${time}`,
        turma_id: t.id,
        turma_name: t.name || "—",
        time,
        duration_h: dur,
        teacher_name: t.teacher_id
          ? teacherMap[t.teacher_id] || "—"
          : "Sem professor",
        room: t.room || null,
        session_id: matchingSession?.id || null,
        has_attendance: matchingSession?.has_attendance || false,
      });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

// Aniversariantes nos próximos 7 dias
function birthdaysThisWeek(students) {
  const today = nowSP();
  const out = [];
  for (let i = 0; i < 7; i++) {
    const ref = new Date(today);
    ref.setDate(today.getDate() + i);
    const refMM = ref.getMonth() + 1;
    const refDD = ref.getDate();
    for (const s of students || []) {
      if ((s?.status || "").toLowerCase() !== "ativo") continue;
      const dob = s.birth_date || s.date_of_birth;
      if (!dob) continue;
      const m = Number(String(dob).slice(5, 7));
      const d = Number(String(dob).slice(8, 10));
      if (m === refMM && d === refDD) {
        out.push({
          id: s.id,
          name: s.full_name || s.name || "—",
          when: i,
          dd: d,
          mm: m,
        });
      }
    }
  }
  // Dedup (caso aluno apareça duplicado)
  const seen = new Set();
  return out
    .filter((b) => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    })
    .slice(0, 8);
}

function relativeDayLabel(daysFromToday) {
  if (daysFromToday === 0) return "hoje";
  if (daysFromToday === 1) return "amanhã";
  const day = nowSP();
  day.setDate(day.getDate() + daysFromToday);
  const dayNames = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  return dayNames[day.getDay()];
}

// ─── Página ──────────────────────────────────────────────────────
export default function RecepcaoV2Page() {
  const { ready, isAdmin, perms, session } = useSession();
  const canReadFinance = isAdmin || !!perms?.finance?.read;
  const canReadRegistry = isAdmin || !!perms?.registry?.read;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [brand, setBrand] = useState({ name: "", logoUrl: "" });
  const [todayClasses, setTodayClasses] = useState([]);
  const [pendingAttendance, setPendingAttendance] = useState([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [birthdays, setBirthdays] = useState([]);

  const today = todayISO();
  const todayDow = nowSP().getDay();

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Tenant branding
        try {
          const s = await supabaseGateway.getTenantSettings?.();
          if (alive) {
            setBrand({
              name: s?.brand_name || "",
              logoUrl: s?.logo_url || "",
            });
          }
        } catch {
          /* mantém defaults */
        }

        // Turmas + Teachers (todos os usuários têm RLS adequado)
        const [turmas, teachers] = await Promise.all([
          financeGateway.listTurmas().catch(() => []),
          financeGateway.listTeachers().catch(() => []),
        ]);
        if (!alive) return;
        const teacherMap = {};
        for (const t of teachers || []) teacherMap[t.id] = t.name;

        // RBAC: professor só vê turmas próprias
        const isProfessor = session?.role === "professor";
        const myTurmas =
          isProfessor && session?.teacherId
            ? (turmas || []).filter(
                (t) => String(t.teacher_id) === String(session.teacherId)
              )
            : turmas || [];

        // Sessions de hoje (1 query: range = hoje 00:00 até amanhã 00:00)
        const todayStart = new Date(`${today}T00:00:00`).toISOString();
        const tomorrowStart = new Date(
          `${addDaysISO(today, 1)}T00:00:00`
        ).toISOString();
        const todaySessions = await financeGateway
          .listSessionsInRange({ start: todayStart, end: tomorrowStart })
          .catch(() => []);

        const filteredTodaySessions = isProfessor
          ? (todaySessions || []).filter((s) =>
              myTurmas.some((t) => t.id === s.turma_id)
            )
          : todaySessions || [];

        const tc = buildTodayClasses(
          myTurmas,
          teacherMap,
          filteredTodaySessions,
          todayDow
        );
        if (!alive) return;
        setTodayClasses(tc);

        // Aulas dos últimos 7 dias sem presença marcada
        const weekAgo = addDaysISO(today, -7);
        const lastWeekStart = new Date(
          `${weekAgo}T00:00:00`
        ).toISOString();
        const lastWeekSessions = await financeGateway
          .listSessionsInRange({ start: lastWeekStart, end: todayStart })
          .catch(() => []);
        const pendingList = (lastWeekSessions || [])
          .filter((s) => !s.has_attendance)
          .filter((s) =>
            isProfessor ? myTurmas.some((t) => t.id === s.turma_id) : true
          )
          .sort((a, b) => String(b.date).localeCompare(String(a.date)))
          .slice(0, 5)
          .map((s) => ({
            ...s,
            turma_name:
              myTurmas.find((t) => t.id === s.turma_id)?.name ||
              (turmas || []).find((t) => t.id === s.turma_id)?.name ||
              "—",
          }));
        if (!alive) return;
        setPendingAttendance(pendingList);

        // Mensalidades em atraso (só admin/finance)
        if (canReadFinance) {
          try {
            const { count, error: pErr } = await supabase
              .from("payments")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending")
              .lt("due_date", today);
            if (!pErr && alive) setOverdueCount(count || 0);
          } catch {
            /* ignore */
          }
        }

        // Aniversariantes da semana (precisa registry read)
        if (canReadRegistry) {
          const students = await financeGateway
            .listStudents()
            .catch(() => []);
          if (!alive) return;
          setBirthdays(birthdaysThisWeek(students));
        }
      } catch (e) {
        if (alive) setError(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, canReadFinance, canReadRegistry]);

  // Subtítulo contextual
  const contextLine = useMemo(() => {
    if (loading) return "Carregando…";
    const parts = [];
    if (todayClasses.length > 0) {
      parts.push(
        `${todayClasses.length} ${
          todayClasses.length === 1 ? "aula" : "aulas"
        } hoje`
      );
    } else {
      parts.push("Sem aulas hoje");
    }
    if (canReadFinance && overdueCount > 0) {
      parts.push(
        `${overdueCount} ${
          overdueCount === 1 ? "mensalidade" : "mensalidades"
        } em atraso`
      );
    }
    if (pendingAttendance.length > 0) {
      parts.push(
        `${pendingAttendance.length} ${
          pendingAttendance.length === 1 ? "aula" : "aulas"
        } sem presença`
      );
    }
    return parts.join(" · ");
  }, [
    loading,
    todayClasses.length,
    overdueCount,
    pendingAttendance.length,
    canReadFinance,
  ]);

  const userFirstName = firstName(session?.name);
  const brandName =
    brand.name || session?.tenantName || "sua escola";

  // ─── Gates ───
  if (!ready) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--p-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Preparando sessão…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div className="p-card overflow-hidden">
        <div
          className="h-1.5"
          style={{
            background:
              "linear-gradient(90deg, var(--p-primary) 0%, var(--p-accent) 100%)",
          }}
        />
        <div className="flex flex-col gap-4 p-5 md:p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brand.logoUrl}
                alt={brand.name || "logo"}
                className="h-14 w-14 shrink-0 rounded-xl object-contain bg-white shadow-sm"
              />
            ) : (
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[var(--p-primary)] text-white text-xl font-semibold shadow-sm">
                {(brand.name || "F").trim().charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wider text-[var(--p-text-faint)]">
                {longDate()}
              </div>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight md:text-3xl truncate">
                {greeting()}, {userFirstName}
              </h1>
              <p className="mt-1 text-sm text-[var(--p-text-muted)]">
                {contextLine}
              </p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          {error}
        </div>
      )}

      {/* Aulas de hoje + Atenção */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <TodayClassesCard
          loading={loading}
          classes={todayClasses}
          className="lg:col-span-2"
        />
        <AttentionCard
          loading={loading}
          isAdmin={isAdmin}
          canReadFinance={canReadFinance}
          canReadRegistry={canReadRegistry}
          overdueCount={overdueCount}
          pendingAttendance={pendingAttendance}
          birthdays={birthdays}
        />
      </div>

      {/* Quick actions (role-aware) */}
      <QuickActions
        isAdmin={isAdmin}
        canReadFinance={canReadFinance}
        canReadRegistry={canReadRegistry}
      />
    </div>
  );
}

// ─── Card: Aulas de hoje ─────────────────────────────────────────
function TodayClassesCard({ loading, classes, className = "" }) {
  return (
    <div className={`p-card overflow-hidden ${className}`}>
      <div className="flex items-center justify-between border-b border-[var(--p-border)] px-5 py-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[var(--p-text-muted)]" />
          <h2 className="text-sm font-semibold">Aulas de hoje</h2>
          <span className="p-chip p-chip-neutral">{classes.length}</span>
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
      ) : classes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--p-surface-2)] text-[var(--p-text-muted)]">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium">Sem aulas agendadas hoje</div>
          <div className="text-xs text-[var(--p-text-muted)]">
            Aproveite pra organizar outras coisas.
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--p-border)]">
          {classes.map((c) => (
            <li
              key={c.key}
              className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--p-surface-2)]"
            >
              <div className="flex w-16 flex-col items-start shrink-0">
                <div className="text-sm font-semibold tabular-nums">
                  {c.time}
                </div>
                <div className="text-[11px] text-[var(--p-text-faint)]">
                  {Math.round(c.duration_h * 60)} min
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium truncate">
                    {c.turma_name}
                  </div>
                  {c.has_attendance ? (
                    <span className="p-chip p-chip-success">
                      <CheckCircle2 className="h-3 w-3" /> Presença OK
                    </span>
                  ) : c.session_id ? (
                    <span className="p-chip p-chip-warning">
                      <AlertCircle className="h-3 w-3" /> Sem presença
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-xs text-[var(--p-text-muted)]">
                  Prof. {c.teacher_name}
                  {c.room ? ` · ${c.room}` : ""}
                </div>
              </div>
              <Link
                href={`/turmas/${c.turma_id}`}
                className="hidden sm:inline-flex p-btn p-btn-ghost text-xs h-8 px-3"
              >
                {c.has_attendance ? "Ver" : "Registrar"}
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Card: Atenção ───────────────────────────────────────────────
function AttentionCard({
  loading,
  isAdmin,
  canReadFinance,
  canReadRegistry,
  overdueCount,
  pendingAttendance,
  birthdays,
}) {
  const hasAny =
    pendingAttendance.length > 0 ||
    (canReadFinance && overdueCount > 0) ||
    birthdays.length > 0;

  return (
    <div className="p-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[var(--p-border)] px-5 py-4">
        <Sparkles className="h-4 w-4 text-[var(--p-text-muted)]" />
        <h2 className="text-sm font-semibold">Atenção do dia</h2>
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : !hasAny ? (
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--p-success-50)] text-[var(--p-success)]">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium">Tudo tranquilo por hoje 🎉</div>
          <div className="text-xs text-[var(--p-text-muted)]">
            Nada pendente esperando você.
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--p-border)]">
          {/* Aulas sem presença */}
          {pendingAttendance.length > 0 && (
            <li className="px-5 py-3">
              <Link
                href={`/turmas/${pendingAttendance[0].turma_id}`}
                className="flex items-start gap-3 hover:bg-[var(--p-surface-2)] -mx-5 px-5 py-1 rounded"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--p-warning-50)] text-[var(--p-warning)]">
                  <CalendarCheck className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {pendingAttendance.length}{" "}
                    {pendingAttendance.length === 1 ? "aula" : "aulas"} sem
                    presença
                  </div>
                  <div className="text-xs text-[var(--p-text-muted)] truncate">
                    {pendingAttendance[0].turma_name}
                    {pendingAttendance.length > 1
                      ? ` e mais ${pendingAttendance.length - 1}`
                      : ""}
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-[var(--p-text-faint)] shrink-0" />
              </Link>
            </li>
          )}

          {/* Mensalidades em atraso (admin) */}
          {canReadFinance && overdueCount > 0 && (
            <li className="px-5 py-3">
              <Link
                href="/financeiro/mensalidades"
                className="flex items-start gap-3 hover:bg-[var(--p-surface-2)] -mx-5 px-5 py-1 rounded"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--p-danger-50)] text-[var(--p-danger)]">
                  <AlertCircle className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {overdueCount}{" "}
                    {overdueCount === 1 ? "mensalidade" : "mensalidades"} em
                    atraso
                  </div>
                  <div className="text-xs text-[var(--p-text-muted)]">
                    Pendências para cobrança
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-[var(--p-text-faint)] shrink-0" />
              </Link>
            </li>
          )}

          {/* Aniversariantes */}
          {birthdays.length > 0 && (
            <li className="px-5 py-3">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--p-primary-50)] text-[var(--p-primary)]">
                  <Cake className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {birthdays.length}{" "}
                    {birthdays.length === 1
                      ? "aniversariante"
                      : "aniversariantes"}{" "}
                    nos próximos 7 dias
                  </div>
                  <ul className="mt-1 space-y-0.5 text-xs text-[var(--p-text-muted)]">
                    {birthdays.slice(0, 3).map((b) => (
                      <li key={b.id}>
                        <span className="font-medium text-[var(--p-text)]">
                          {b.name}
                        </span>{" "}
                        · {relativeDayLabel(b.when)}
                      </li>
                    ))}
                    {birthdays.length > 3 && (
                      <li className="text-[var(--p-text-faint)]">
                        +{birthdays.length - 3} outros
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ─── Quick actions ───────────────────────────────────────────────
function QuickActions({ isAdmin, canReadFinance, canReadRegistry }) {
  const all = [
    {
      key: "aluno",
      label: "Novo aluno",
      icon: Users,
      href: "/alunos",
      visible: canReadRegistry,
    },
    {
      key: "turma",
      label: "Nova turma",
      icon: BookOpen,
      href: "/turmas",
      visible: canReadRegistry,
    },
    {
      key: "agenda",
      label: "Nova aula",
      icon: Calendar,
      href: "/agenda",
      visible: true,
    },
    {
      key: "lancamento",
      label: "Lançamento",
      icon: Wallet,
      href: "/financeiro",
      visible: canReadFinance,
    },
    {
      key: "email",
      label: "Enviar e-mail",
      icon: Mail,
      href: "/painel",
      visible: isAdmin,
    },
  ];
  const visible = all.filter((a) => a.visible).slice(0, 4);
  if (visible.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--p-text-faint)]">
        Ações rápidas
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {visible.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.key}
              href={a.href}
              className="p-card p-card-hover flex items-center gap-3 px-4 py-3"
            >
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--p-primary-50)] text-[var(--p-primary)]">
                <Icon className="h-4 w-4" />
              </div>
              <div className="text-sm font-medium">{a.label}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

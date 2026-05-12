"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/contexts/SessionContext";
import { financeGateway } from "@/lib/financeGateway";
import AppModal, {
  FormError,
  ModalActions,
  ConfirmDeleteModal,
} from "@/components/AppModal";
import {
  ArrowLeft,
  Users,
  UsersRound,
  BookOpen,
  Calendar,
  Clock,
  Pencil,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  BarChart3,
  TrendingUp,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────
const WEEKDAYS = [
  { value: "1", label: "Segunda" },
  { value: "2", label: "Terça" },
  { value: "3", label: "Quarta" },
  { value: "4", label: "Quinta" },
  { value: "5", label: "Sexta" },
  { value: "6", label: "Sábado" },
  { value: "0", label: "Domingo" },
];
const WEEKDAY_ABBR = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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

function fmtBR(s) {
  if (!s) return "—";
  const str = String(s);
  const input = str.length <= 10 ? `${str}T00:00:00` : str;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}
function fmtBR_long(s) {
  if (!s) return "—";
  const str = String(s);
  const input = str.length <= 10 ? `${str}T00:00:00` : str;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function fmtNum(n) {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

const formatScheduleLine = (rule) => {
  if (!rule) return null;
  const wd = Number.isInteger(rule.weekday)
    ? WEEKDAY_ABBR[rule.weekday]
    : "?";
  const t = String(rule.time || "").slice(0, 5) || "—";
  const dur = Number(rule.duration_hours || 0);
  const mins = dur > 0 ? ` · ${Math.round(dur * 60)}min` : "";
  return `${wd} ${t}${mins}`;
};

const norm = (v) => (v === undefined || v === null ? "" : String(v));
const ymCurrent = new Date().toISOString().slice(0, 7);

// ─── Página ──────────────────────────────────────────────────────
export default function TurmaDetailPage() {
  const router = useRouter();
  const search = useSearchParams();
  const params = useParams();
  const turmaId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const sessionCtx = useSession?.() ?? {};
  const session = sessionCtx.session ?? sessionCtx;
  const ready = sessionCtx.ready ?? true;
  const role = session?.role ?? "admin";
  const teacherId = session?.teacherId ?? null;
  const isProfessor = role === "professor";

  const [turma, setTurma] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [members, setMembers] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modais
  const [editTurmaOpen, setEditTurmaOpen] = useState(false);
  const [sessionTarget, setSessionTarget] = useState(undefined); // null=novo, obj=edit, undefined=fechado
  const [sessionPrefill, setSessionPrefill] = useState(null); // prefill via query
  const [removeMemberTarget, setRemoveMemberTarget] = useState(null);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState(null);

  // Add member
  const [addStudentId, setAddStudentId] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  // Auto-open from agenda redirect (?modal=criar&date=...&duration_hours=...&notes=...)
  const openOnceRef = useRef(false);

  // Effective teacher id (RBAC professor)
  const effectiveTeacherId = useMemo(() => {
    if (!isProfessor) return null;
    if (teacherId) return norm(teacherId);
    const byUser = teachers.find(
      (t) => norm(t.user_id ?? t.userId) === norm(session?.userId)
    );
    if (byUser?.id) return norm(byUser.id);
    const byName = teachers.find(
      (t) => (t.name || "").trim() === (session?.name || "").trim()
    );
    if (byName?.id) return norm(byName.id);
    return null;
  }, [isProfessor, teacherId, teachers, session?.userId, session?.name]);

  async function loadAll() {
    try {
      setLoading(true);
      setError(null);
      const [turmas, ths, mbs, studs, sess] = await Promise.all([
        financeGateway.listTurmas(),
        financeGateway.listTeachers(),
        financeGateway.listTurmaMembers(turmaId),
        financeGateway.listStudents(),
        financeGateway.listSessions(turmaId),
      ]);
      const t = turmas.find((x) => x.id === turmaId);
      if (!t) {
        setError("Turma não encontrada.");
        setTimeout(() => router.push("/turmas"), 1200);
        return;
      }
      setTurma(t);
      setTeachers(ths);
      setMembers(mbs);
      setAllStudents(studs);
      setSessions(Array.isArray(sess) ? sess : []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready || !turmaId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, turmaId]);

  // RBAC: professor não pode abrir turma alheia
  useEffect(() => {
    if (!ready || !isProfessor || !turma) return;
    if (!effectiveTeacherId) return;
    if (
      norm(turma.teacher_id ?? turma.teacherId) !== effectiveTeacherId
    ) {
      alert("Você não tem acesso a esta turma.");
      router.replace("/turmas");
    }
  }, [ready, isProfessor, turma, effectiveTeacherId, router]);

  // Auto-open Nova sessão via query (vindo da Agenda)
  useEffect(() => {
    const wantsNew = search?.get("modal") === "criar";
    if (
      !wantsNew ||
      openOnceRef.current ||
      !Array.isArray(members) ||
      members.length === 0
    )
      return;
    const dateQS = (search.get("date") || "").slice(0, 10);
    const durQS = Number(search.get("duration_hours"));
    const notesQS = search.get("notes") || "";
    const duration =
      Number.isFinite(durQS) && durQS >= 0.5
        ? durQS
        : Number(turma?.meeting_duration_default ?? 0.5);

    setSessionPrefill({
      date: dateQS,
      notes: notesQS,
      duration_hours: duration,
    });
    setSessionTarget(null);
    openOnceRef.current = true;

    // limpa query
    const url = new URL(window.location.href);
    ["modal", "date", "duration_hours", "notes"].forEach((k) =>
      url.searchParams.delete(k)
    );
    window.history.replaceState({}, "", url);
  }, [search, turma?.meeting_duration_default, members]);

  const teacherName = useMemo(() => {
    if (!turma?.teacher_id) return "Sem professor";
    return teachers.find((t) => t.id === turma.teacher_id)?.name || "—";
  }, [teachers, turma]);

  const candidates = useMemo(() => {
    const inTurma = new Set(members.map((m) => m.id));
    return allStudents
      .filter((s) => s.status === "ativo" && !inTurma.has(s.id))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [allStudents, members]);

  // Stats
  const stats = useMemo(() => {
    const monthSessions = sessions.filter((s) =>
      String(s.date || "").startsWith(ymCurrent)
    );
    const withAttendance = sessions.filter((s) => s.has_attendance).length;
    const attendancePct =
      sessions.length > 0
        ? Math.round((withAttendance / sessions.length) * 100)
        : null;
    return {
      total: members.length,
      capacity: Number(turma?.capacity || 0),
      sessionsTotal: sessions.length,
      sessionsThisMonth: monthSessions.length,
      attendancePct,
    };
  }, [members, turma, sessions]);

  // Ações de membros
  async function onAddMember() {
    if (!addStudentId || isProfessor) return;
    try {
      setAddingMember(true);
      await financeGateway.addStudentToTurma(turma.id, addStudentId);
      setAddStudentId("");
      await loadAll();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setAddingMember(false);
    }
  }

  // ─── Render ────────────────────────────────────────────────────
  if (!ready || loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--p-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />{" "}
        {!ready ? "Preparando sessão…" : "Carregando turma…"}
      </div>
    );
  }
  if (error && !turma) {
    return (
      <div className="space-y-3">
        <Link
          href="/turmas"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--p-text-muted)] hover:text-[var(--p-text)]"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para turmas
        </Link>
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          {error}
        </div>
      </div>
    );
  }
  if (!turma) return null;

  const professorSemVinculo =
    isProfessor && !effectiveTeacherId && (teachers?.length ?? 0) > 0;

  const sortedSessions = [...sessions].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
  );

  return (
    <div className="space-y-6">
      {/* Voltar */}
      <Link
        href="/turmas"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--p-text-muted)] hover:text-[var(--p-text)]"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para turmas
      </Link>

      {/* Header card */}
      <div className="p-card overflow-hidden">
        <div
          className="h-1.5"
          style={{ background: colorFor(turma.name) }}
        />
        <div className="p-5 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-wider text-[var(--p-text-faint)]">
                Turma
              </div>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight truncate md:text-3xl">
                {turma.name || "—"}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="p-chip p-chip-neutral">
                  <UsersRound className="h-3 w-3" /> Prof. {teacherName}
                </span>
                {Array.isArray(turma.meeting_rules) &&
                  turma.meeting_rules.slice(0, 3).map((r, i) => (
                    <span key={i} className="p-chip p-chip-neutral">
                      <Clock className="h-3 w-3" /> {formatScheduleLine(r)}
                    </span>
                  ))}
                {Array.isArray(turma.meeting_rules) &&
                  turma.meeting_rules.length > 3 && (
                    <span className="text-xs text-[var(--p-text-faint)]">
                      +{turma.meeting_rules.length - 3} outros
                    </span>
                  )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/relatorios/assiduidade?turma=${turma.id}&ym=${ymCurrent}`}
                className="p-btn p-btn-ghost"
              >
                <BarChart3 className="h-4 w-4" />
                <span>Relatório</span>
              </Link>
              {!isProfessor && (
                <button
                  onClick={() => setEditTurmaOpen(true)}
                  className="p-btn p-btn-ghost"
                >
                  <Pencil className="h-4 w-4" />
                  <span>Editar turma</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {professorSemVinculo && (
        <div className="rounded-lg border border-[var(--p-warning)]/30 bg-[var(--p-warning-50)] px-4 py-3 text-xs text-[var(--p-warning)]">
          Sem professor vinculado à sessão. Defina <code>session.teacherId</code>{" "}
          ou crie um professor com <code>user_id</code> ={" "}
          <code>{session?.userId || "?"}</code>.
        </div>
      )}

      {error && turma && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          {error}
        </div>
      )}

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard
          icon={Users}
          label="Alunos"
          value={stats.total}
          sub={
            stats.capacity > 0 ? `de ${stats.capacity} vagas` : "sem capacidade"
          }
          tone="primary"
        />
        <StatCard
          icon={Calendar}
          label="Aulas registradas"
          value={stats.sessionsTotal}
          sub={`${stats.sessionsThisMonth} este mês`}
          tone="success"
        />
        <StatCard
          icon={TrendingUp}
          label="Presença marcada"
          value={
            stats.attendancePct !== null
              ? `${stats.attendancePct}%`
              : "—"
          }
          sub={`em ${stats.sessionsTotal} aulas`}
          tone={
            stats.attendancePct === null
              ? "neutral"
              : stats.attendancePct >= 80
              ? "success"
              : stats.attendancePct >= 50
              ? "warning"
              : "danger"
          }
        />
        <StatCard
          icon={BookOpen}
          label="Encontros/semana"
          value={
            Array.isArray(turma.meeting_rules)
              ? turma.meeting_rules.length
              : 0
          }
          sub="recorrência semanal"
          tone="neutral"
        />
      </section>

      {/* Alunos */}
      <section id="alunos" className="p-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--p-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[var(--p-text-muted)]" />
            <h2 className="text-sm font-semibold">Alunos da turma</h2>
            <span className="p-chip p-chip-neutral">{members.length}</span>
          </div>
          {!isProfessor && candidates.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={addStudentId}
                onChange={(e) => setAddStudentId(e.target.value)}
                className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40 sm:w-64"
              >
                <option value="">— selecionar aluno —</option>
                {candidates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                onClick={onAddMember}
                disabled={!addStudentId || addingMember}
                className="p-btn p-btn-primary"
              >
                {addingMember ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Adicionar</span>
              </button>
            </div>
          )}
        </div>

        {members.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-[var(--p-text-muted)]">
            Nenhum aluno nesta turma.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--p-border)]">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                    style={{ background: colorFor(m.name) }}
                  >
                    {String(m.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{m.name}</div>
                    <div className="text-[11px] text-[var(--p-text-muted)]">
                      {m.status === "ativo" ? "Ativo" : m.status || "—"}
                    </div>
                  </div>
                </div>
                {!isProfessor && (
                  <button
                    onClick={() => setRemoveMemberTarget(m)}
                    className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)]"
                    aria-label="Remover"
                    title="Remover da turma"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sessões */}
      <section id="sessoes" className="p-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--p-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[var(--p-text-muted)]" />
            <h2 className="text-sm font-semibold">Aulas / Sessões</h2>
            <span className="p-chip p-chip-neutral">{sessions.length}</span>
          </div>
          <button
            onClick={() => {
              setSessionPrefill(null);
              setSessionTarget(null);
            }}
            className="p-btn p-btn-primary"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova sessão</span>
            <span className="sm:hidden">Nova</span>
          </button>
        </div>

        {sortedSessions.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-[var(--p-text-muted)]">
            Nenhuma sessão cadastrada.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--p-border)]">
            {sortedSessions.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-3 px-5 py-3 hover:bg-[var(--p-surface-2)]"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--p-primary-50)] text-[var(--p-primary)]">
                  <Calendar className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{fmtBR(s.date)}</div>
                    <span className="text-xs text-[var(--p-text-muted)]">
                      · {fmtNum(s.duration_hours)}h
                    </span>
                    {s.has_attendance ? (
                      <span className="p-chip p-chip-success">
                        <CheckCircle2 className="h-3 w-3" /> Presença
                      </span>
                    ) : (
                      <span className="p-chip p-chip-warning">
                        Sem presença
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--p-text-muted)]">
                    {fmtBR_long(s.date)}
                  </div>
                  {s.notes && (
                    <div className="mt-1 text-xs text-[var(--p-text-muted)] line-clamp-2">
                      {s.notes}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setSessionTarget(s)}
                    className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                    aria-label="Editar"
                    title="Abrir / Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteSessionTarget(s)}
                    className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)]"
                    aria-label="Excluir"
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Modais */}
      {editTurmaOpen && !isProfessor && (
        <EditTurmaModal
          turma={turma}
          teachers={teachers}
          onClose={() => setEditTurmaOpen(false)}
          onSaved={async () => {
            setEditTurmaOpen(false);
            await loadAll();
          }}
        />
      )}

      {sessionTarget !== undefined && (
        <SessionFormModal
          turma={turma}
          members={members}
          initial={sessionTarget}
          prefill={sessionPrefill}
          onClose={() => {
            setSessionTarget(undefined);
            setSessionPrefill(null);
          }}
          onSaved={async () => {
            setSessionTarget(undefined);
            setSessionPrefill(null);
            await loadAll();
          }}
        />
      )}

      {removeMemberTarget && !isProfessor && (
        <ConfirmDeleteModal
          title="Remover aluno da turma"
          itemName={removeMemberTarget.name}
          description="O aluno deixa de estar vinculado à turma. Ele continua cadastrado no sistema."
          onCancel={() => setRemoveMemberTarget(null)}
          onConfirm={async () => {
            await financeGateway.removeStudentFromTurma(
              turma.id,
              removeMemberTarget.id
            );
            setRemoveMemberTarget(null);
            await loadAll();
          }}
        />
      )}

      {deleteSessionTarget && (
        <ConfirmDeleteModal
          title="Excluir sessão"
          itemName={fmtBR(deleteSessionTarget.date)}
          description="As presenças desta sessão também serão removidas."
          onCancel={() => setDeleteSessionTarget(null)}
          onConfirm={async () => {
            await financeGateway.deleteSession(deleteSessionTarget.id);
            setDeleteSessionTarget(null);
            await loadAll();
          }}
        />
      )}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────
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

// ─── Modal: Editar turma (com meeting_rules) ─────────────────────
function EditTurmaModal({ turma, teachers, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: turma?.name || "",
    teacher_id: turma?.teacher_id || "",
    capacity: String(turma?.capacity || "20"),
    meeting_rules: Array.isArray(turma?.meeting_rules)
      ? turma.meeting_rules.map((r) => ({
          weekday:
            r.weekday === 0 || r.weekday ? String(r.weekday) : "",
          time: r.time || "",
          duration_hours: String(r.duration_hours ?? "0.5"),
        }))
      : [],
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function updateRule(idx, key, value) {
    setForm((f) => {
      const next = [...(f.meeting_rules || [])];
      next[idx] = { ...next[idx], [key]: value };
      return { ...f, meeting_rules: next };
    });
  }
  function addRule() {
    setForm((f) => ({
      ...f,
      meeting_rules: [
        ...(f.meeting_rules || []),
        { weekday: "", time: "", duration_hours: "0.5" },
      ],
    }));
  }
  function removeRule(idx) {
    setForm((f) => {
      const next = [...(f.meeting_rules || [])];
      next.splice(idx, 1);
      return { ...f, meeting_rules: next };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    const name = form.name.trim();
    if (!name) return setErr("Nome é obrigatório.");
    if (!form.teacher_id) return setErr("Professor é obrigatório.");
    try {
      setSaving(true);
      await financeGateway.updateTurma(turma.id, {
        name,
        teacher_id: form.teacher_id,
        capacity: Number(form.capacity || 20),
        meeting_rules: (form.meeting_rules || []).map((r) => ({
          weekday: r.weekday === "" ? null : Number(r.weekday),
          time: r.time || null,
          duration_hours: Number(r.duration_hours || 0.5),
        })),
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
      title="Editar turma"
      onClose={saving ? () => {} : onClose}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Nome *
          </span>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">
              Professor *
            </span>
            <select
              value={form.teacher_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, teacher_id: e.target.value }))
              }
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            >
              <option value="">Selecione um professor</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">
              Capacidade
            </span>
            <input
              type="number"
              min="1"
              value={form.capacity}
              onChange={(e) =>
                setForm((f) => ({ ...f, capacity: e.target.value }))
              }
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </label>
        </div>

        <div className="border-t border-[var(--p-border)] pt-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">
              Encontros na semana
            </span>
            <button
              type="button"
              onClick={addRule}
              className="p-btn p-btn-ghost h-8 px-3 text-xs"
            >
              <Plus className="h-3 w-3" /> Adicionar
            </button>
          </div>
          {(form.meeting_rules || []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--p-border)] px-4 py-6 text-center text-xs text-[var(--p-text-muted)]">
              Nenhum encontro definido.
            </div>
          ) : (
            <div className="space-y-2">
              {form.meeting_rules.map((r, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-2)] p-3"
                >
                  <select
                    value={r.weekday}
                    onChange={(e) => updateRule(idx, "weekday", e.target.value)}
                    className="col-span-12 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm sm:col-span-4"
                  >
                    <option value="">Dia da semana</option>
                    {WEEKDAYS.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={r.time}
                    onChange={(e) => updateRule(idx, "time", e.target.value)}
                    className="col-span-6 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm sm:col-span-3"
                  />
                  <select
                    value={r.duration_hours}
                    onChange={(e) =>
                      updateRule(idx, "duration_hours", e.target.value)
                    }
                    className="col-span-5 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm sm:col-span-3"
                  >
                    <option value="0.5">0,5h (30min)</option>
                    <option value="1">1h</option>
                    <option value="1.5">1,5h</option>
                    <option value="2">2h</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeRule(idx)}
                    className="col-span-1 sm:col-span-2 rounded-lg p-2 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)]"
                    aria-label="Remover encontro"
                    title="Remover encontro"
                  >
                    <Trash2 className="mx-auto h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
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

// ─── Modal: Criar/Editar sessão com presença inline ──────────────
function SessionFormModal({ turma, members, initial, prefill, onClose, onSaved }) {
  const isEdit = !!initial;

  // Default date/time/notes
  const defaultTime = useMemo(() => {
    if (turma?.meeting_time) return turma.meeting_time;
    const r = Array.isArray(turma?.meeting_rules)
      ? turma.meeting_rules.find((rr) => rr?.time)
      : null;
    return r?.time || "";
  }, [turma]);

  const initialNotes =
    initial?.notes ??
    prefill?.notes ??
    (defaultTime ? `Horário padrão: ${defaultTime}` : "");

  const [form, setForm] = useState({
    date: initial?.date || prefill?.date || "",
    notes: initialNotes,
    duration_hours: String(
      initial?.duration_hours ??
        prefill?.duration_hours ??
        turma?.meeting_duration_default ??
        "0.5"
    ),
  });
  const [attendance, setAttendance] = useState(() =>
    members.map((m) => ({
      student_id: m.id,
      name: m.name,
      present: false,
      note: "",
    }))
  );
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  // Carregar presença existente em modo edit
  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingAtt(true);
        const rows = await financeGateway.listAttendance(initial.id);
        const byStu = new Map(rows.map((r) => [r.student_id, r]));
        const draft = members.map((m) => ({
          student_id: m.id,
          name: m.name,
          present: byStu.get(m.id)?.present ?? false,
          note: byStu.get(m.id)?.note ?? "",
        }));
        if (!cancelled) setAttendance(draft);
      } catch (e) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoadingAtt(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, initial?.id]);

  const presentCount = attendance.filter((r) => r.present).length;

  function setAll(value) {
    setAttendance((arr) => arr.map((r) => ({ ...r, present: !!value })));
  }
  function togglePresence(studentId, present) {
    setAttendance((arr) =>
      arr.map((r) =>
        r.student_id === studentId ? { ...r, present: !!present } : r
      )
    );
  }
  function updateNote(studentId, note) {
    setAttendance((arr) =>
      arr.map((r) =>
        r.student_id === studentId ? { ...r, note } : r
      )
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    if (!form.date) return setErr("Data é obrigatória.");
    try {
      setSaving(true);
      const enrolledNow = members.filter((m) => m.status === "ativo").length;
      const payload = {
        date: form.date,
        notes: form.notes,
        duration_hours: Number(form.duration_hours || 0.5),
        headcount_snapshot: enrolledNow,
      };
      let sessionId = initial?.id;
      if (isEdit) {
        await financeGateway.updateSession(initial.id, payload);
      } else {
        const created = await financeGateway.createSession({
          turma_id: turma.id,
          ...payload,
        });
        sessionId = created?.id;
      }
      if (!sessionId) throw new Error("Falha ao obter ID da sessão.");
      for (const row of attendance) {
        await financeGateway.upsertAttendance(sessionId, row.student_id, {
          present: !!row.present,
          note: row.note || "",
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
      title={isEdit ? `Sessão · ${fmtBR(initial.date)}` : "Nova sessão"}
      onClose={saving ? () => {} : onClose}
      maxWidth="3xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />

        {/* Geral */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">
              Data *
            </span>
            <input
              type="date"
              value={form.date}
              onChange={(e) =>
                setForm((f) => ({ ...f, date: e.target.value }))
              }
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">
              Duração (h) *
            </span>
            <select
              value={form.duration_hours}
              onChange={(e) =>
                setForm((f) => ({ ...f, duration_hours: e.target.value }))
              }
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            >
              <option value="0.5">0,5h (30min)</option>
              <option value="1">1h</option>
              <option value="1.5">1,5h</option>
              <option value="2">2h</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Resumo / Observação geral
          </span>
          <textarea
            value={form.notes}
            onChange={(e) =>
              setForm((f) => ({ ...f, notes: e.target.value }))
            }
            rows={3}
            placeholder="Tópicos da aula, exercícios, etc."
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>

        {/* Presença */}
        <div className="border-t border-[var(--p-border)] pt-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Presença</span>
              <span className="text-xs text-[var(--p-text-muted)] tabular-nums">
                {presentCount}/{members.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAll(true)}
                className="rounded-md px-2 py-1 text-xs text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]"
              >
                Marcar todos
              </button>
              <button
                type="button"
                onClick={() => setAll(false)}
                className="rounded-md px-2 py-1 text-xs text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]"
              >
                Desmarcar
              </button>
            </div>
          </div>

          {loadingAtt ? (
            <div className="flex items-center gap-2 py-4 text-xs text-[var(--p-text-muted)]">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando presença…
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--p-border)] px-4 py-6 text-center text-xs text-[var(--p-text-muted)]">
              A turma ainda não tem alunos vinculados.
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--p-border)] rounded-lg border border-[var(--p-border)]">
              {attendance.map((row) => (
                <li
                  key={row.student_id}
                  className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: colorFor(row.name) }}
                    >
                      {String(row.name || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <span className="truncate text-sm font-medium">
                      {row.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => togglePresence(row.student_id, true)}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                        row.present
                          ? "bg-[var(--p-success-50)] text-[var(--p-success)]"
                          : "text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]"
                      }`}
                    >
                      <CheckCircle2 className="h-3 w-3" /> Presente
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePresence(row.student_id, false)}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                        !row.present
                          ? "bg-[var(--p-danger-50)] text-[var(--p-danger)]"
                          : "text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]"
                      }`}
                    >
                      <XCircle className="h-3 w-3" /> Falta
                    </button>
                  </div>
                  <input
                    value={row.note || ""}
                    onChange={(e) =>
                      updateNote(row.student_id, e.target.value)
                    }
                    placeholder="Observação"
                    className="w-full rounded-md border border-[var(--p-border)] bg-[var(--p-surface)] px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40 sm:max-w-xs"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <ModalActions
          onCancel={onClose}
          submitting={saving}
          submitLabel={isEdit ? "Salvar" : "Cadastrar"}
        />
      </form>
    </AppModal>
  );
}

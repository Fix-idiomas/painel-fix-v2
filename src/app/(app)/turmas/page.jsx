"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "@/contexts/SessionContext";
import { financeGateway } from "@/lib/financeGateway";
import { supabase } from "@/lib/supabaseClient";
import {
  Search,
  Plus,
  Users,
  Clock,
  Trash2,
  CheckCircle2,
  PauseCircle,
  BookOpen,
  Loader2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Check,
  Pencil,
  UsersRound,
  ExternalLink,
} from "lucide-react";
import AppModal, {
  FormError,
  ModalActions,
  ConfirmDeleteModal,
} from "@/components/AppModal";

// ─── Helpers ──────────────────────────────────────────────────────
const AVATAR_PALETTE = [
  "#8B1C2C", "#E94F37", "#0F766E", "#D97706", "#1E40AF",
  "#7C3AED", "#BE123C", "#0891B2", "#15803D", "#9333EA", "#DC2626", "#059669",
];
const WEEKDAY_ABBR = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function colorFor(name) {
  const s = String(name || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function formatScheduleLine(rule) {
  if (!rule) return null;
  const wd = Number.isInteger(rule.weekday) ? WEEKDAY_ABBR[rule.weekday] : "?";
  const t = String(rule.time || "").slice(0, 5) || "—";
  const dur = Number(rule.duration_hours || 0);
  const mins = dur > 0 ? ` · ${Math.round(dur * 60)}min` : "";
  return `${wd} ${t}${mins}`;
}

function statusChip(s) {
  if (s === "lotada")
    return { cls: "p-chip-warning", icon: Users, label: "Lotada" };
  if (s === "vazia")
    return { cls: "p-chip-neutral", icon: PauseCircle, label: "Sem alunos" };
  return { cls: "p-chip-success", icon: CheckCircle2, label: "Ativa" };
}

const norm = (v) => (v === undefined || v === null ? "" : String(v));

function teacherMatchesTurma(turma, teacherIdEff, teacherNameEff) {
  const tid = norm(teacherIdEff);
  const tname = (teacherNameEff || "").trim();
  const directMatches = [
    norm(turma.teacher_id),
    norm(turma.teacherId),
    norm(turma.teacher_uuid),
    norm(turma.teacher?.id),
  ];
  if (tid && directMatches.some((x) => x && norm(x) === tid)) return true;
  const turmaTeacherName = (
    turma.teacher_name ??
    turma.teacher?.name ??
    turma.teacherName ??
    ""
  ).trim();
  if (tname && turmaTeacherName && turmaTeacherName === tname) return true;
  return false;
}

// ─── Página ──────────────────────────────────────────────────────
export default function TurmasPage() {
  const sessionCtx = useSession?.() ?? {};
  const session = sessionCtx.session ?? sessionCtx;
  const ready = sessionCtx.ready ?? true;
  const role = session?.role ?? "admin";
  const teacherId = session?.teacherId ?? null;
  const isProfessor = role === "professor";

  const [turmas, setTurmas] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [membersByTurma, setMembersByTurma] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [q, setQ] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("all");

  // Modais
  const [editTarget, setEditTarget] = useState(undefined); // null = novo, obj = edit, undefined = fechado
  const [manageTarget, setManageTarget] = useState(null);
  const [detailsTarget, setDetailsTarget] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  async function load() {
    try {
      setError(null);
      const [tu, ts, sts, membersRes] = await Promise.all([
        financeGateway.listTurmas(),
        financeGateway.listTeachers(),
        financeGateway.listStudents(),
        supabase.from("turma_members").select("turma_id"),
      ]);
      if (membersRes?.error) throw new Error(membersRes.error.message);
      setTurmas(Array.isArray(tu) ? tu : []);
      setTeachers(Array.isArray(ts) ? ts : []);
      setStudents(Array.isArray(sts) ? sts : []);
      const counts = {};
      for (const m of membersRes.data || []) {
        counts[m.turma_id] = (counts[m.turma_id] || 0) + 1;
      }
      setMembersByTurma(counts);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const teacherMap = useMemo(() => {
    const m = {};
    for (const t of teachers) m[t.id] = t.name;
    return m;
  }, [teachers]);

  const decorated = useMemo(() => {
    return turmas.map((t) => {
      const studentsCount = membersByTurma[t.id] || 0;
      const capacity = Number(t.capacity || 0);
      let status = "ativa";
      if (studentsCount === 0) status = "vazia";
      else if (capacity > 0 && studentsCount >= capacity) status = "lotada";
      return {
        ...t,
        _teacherName: t.teacher_id ? teacherMap[t.teacher_id] || "—" : "Sem professor",
        _students: studentsCount,
        _status: status,
      };
    });
  }, [turmas, teacherMap, membersByTurma]);

  // RBAC professor: vê só as próprias
  const { effectiveTeacherId, effectiveTeacherName } = useMemo(() => {
    if (!isProfessor)
      return { effectiveTeacherId: null, effectiveTeacherName: null };
    if (teacherId)
      return {
        effectiveTeacherId: norm(teacherId),
        effectiveTeacherName: session?.name || null,
      };
    const byUser = teachers.find(
      (t) => norm(t.user_id ?? t.userId) === norm(session?.userId)
    );
    if (byUser?.id)
      return {
        effectiveTeacherId: norm(byUser.id),
        effectiveTeacherName: byUser.name || null,
      };
    const byName = teachers.find(
      (t) => (t.name || "").trim() === (session?.name || "").trim()
    );
    if (byName?.id)
      return {
        effectiveTeacherId: norm(byName.id),
        effectiveTeacherName: byName.name || null,
      };
    return {
      effectiveTeacherId: null,
      effectiveTeacherName: session?.name || null,
    };
  }, [isProfessor, teacherId, teachers, session?.userId, session?.name]);

  const visibleTurmas = useMemo(() => {
    if (!isProfessor) return decorated;
    if (!effectiveTeacherId && !effectiveTeacherName) return [];
    return decorated.filter((t) =>
      teacherMatchesTurma(t, effectiveTeacherId, effectiveTeacherName)
    );
  }, [decorated, isProfessor, effectiveTeacherId, effectiveTeacherName]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return visibleTurmas.filter((t) => {
      if (teacherFilter === "none") {
        if (t.teacher_id) return false;
      } else if (teacherFilter !== "all") {
        if (t.teacher_id !== teacherFilter) return false;
      }
      if (!term) return true;
      const n = String(t.name || "").toLowerCase();
      const tn = String(t._teacherName || "").toLowerCase();
      return n.includes(term) || tn.includes(term);
    });
  }, [visibleTurmas, q, teacherFilter]);

  const counts = useMemo(() => {
    const c = {
      total: visibleTurmas.length,
      ativa: 0,
      lotada: 0,
      vazia: 0,
      matriculados: 0,
    };
    for (const t of visibleTurmas) {
      c[t._status] = (c[t._status] || 0) + 1;
      c.matriculados += t._students;
    }
    return c;
  }, [visibleTurmas]);

  if (!ready) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--p-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Preparando sessão…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Turmas
          </h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${counts.total} turmas · ${counts.ativa} ativas · ${counts.lotada} lotadas · ${counts.vazia} sem alunos · ${counts.matriculados} matriculados`}
          </p>
          {isProfessor && !effectiveTeacherId && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[var(--p-warning)]/30 bg-[var(--p-warning-50)] px-3 py-2 text-xs text-[var(--p-warning)]">
              Sem professor vinculado à sessão. Defina{" "}
              <code>session.teacherId</code> para ver suas turmas.
            </div>
          )}
        </div>
        {!isProfessor && (
          <button
            className="p-btn p-btn-primary self-start sm:self-auto"
            onClick={() => setEditTarget(null)}
          >
            <Plus className="h-4 w-4" />
            <span>Nova turma</span>
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--p-text-faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar turma ou professor…"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--p-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </div>
        {!isProfessor && (
          <select
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
            aria-label="Filtrar por professor"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40 sm:w-56"
          >
            <option value="all">Todos os professores</option>
            <option value="none">Sem professor</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          Erro ao carregar turmas: {error}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="p-card flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando turmas…
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-card flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--p-surface-2)] text-[var(--p-text-muted)]">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium">Nenhuma turma encontrada</div>
          <div className="text-xs text-[var(--p-text-muted)]">
            {q
              ? "Tente ajustar a busca."
              : isProfessor
              ? "Você não tem turmas vinculadas."
              : "Cadastre uma turma para começar."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {filtered.map((t) => {
            const { cls, icon: Icon, label } = statusChip(t._status);
            const capacity = Number(t.capacity || 0);
            const fill =
              capacity > 0
                ? Math.min(100, Math.round((t._students / capacity) * 100))
                : 0;
            const rules = Array.isArray(t.meeting_rules) ? t.meeting_rules : [];
            return (
              <div key={t.id} className="p-card p-card-hover flex flex-col">
                <div
                  className="h-1.5 rounded-t-2xl"
                  style={{ background: colorFor(t.name) }}
                />
                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold truncate">
                        {t.name || "—"}
                      </h3>
                      <div className="mt-0.5 text-xs text-[var(--p-text-muted)] truncate">
                        Prof. {t._teacherName}
                      </div>
                    </div>
                    {!isProfessor && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => setEditTarget(t)}
                          className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                          aria-label="Editar"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setManageTarget(t)}
                          className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                          aria-label="Gerenciar alunos"
                          title="Gerenciar alunos"
                        >
                          <UsersRound className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setToDelete(t)}
                          className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)]"
                          aria-label="Remover"
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 text-xs text-[var(--p-text-muted)]">
                    {rules.length === 0 ? (
                      <span className="inline-flex items-center gap-2 text-[var(--p-text-faint)]">
                        <Clock className="h-3.5 w-3.5" /> Sem horário cadastrado
                      </span>
                    ) : (
                      rules.slice(0, 3).map((r, i) => (
                        <div key={i} className="inline-flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formatScheduleLine(r)}</span>
                        </div>
                      ))
                    )}
                    {rules.length > 3 && (
                      <span className="text-[var(--p-text-faint)]">
                        +{rules.length - 3} outros horários
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="flex items-baseline justify-between">
                      <div className="text-xs text-[var(--p-text-muted)]">
                        Ocupação
                      </div>
                      <div className="text-xs font-medium tabular-nums">
                        {t._students}
                        {capacity > 0 ? `/${capacity}` : ""}
                      </div>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--p-surface-2)]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${fill}%`,
                          background:
                            fill >= 100
                              ? "var(--p-warning)"
                              : "var(--p-primary)",
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-[var(--p-border)] pt-3">
                    <span className={`p-chip ${cls}`}>
                      <Icon className="h-3 w-3" /> {label}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setDetailsTarget(t)}
                        className="text-xs font-medium text-[var(--p-primary)] hover:text-[var(--p-primary-600)]"
                      >
                        Detalhes
                      </button>
                      <Link
                        href={`/turmas/${t.id}`}
                        className="text-xs font-medium text-[var(--p-text-muted)] hover:text-[var(--p-text)] inline-flex items-center gap-1"
                        title="Abrir página da turma"
                      >
                        Abrir <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modais */}
      {editTarget !== undefined && !isProfessor && (
        <TurmaFormModal
          initial={editTarget}
          teachers={teachers}
          onClose={() => setEditTarget(undefined)}
          onSaved={async () => {
            setEditTarget(undefined);
            await load();
          }}
        />
      )}

      {manageTarget && !isProfessor && (
        <ManageMembersModal
          turma={manageTarget}
          allStudents={students}
          onClose={() => setManageTarget(null)}
          onChanged={async () => {
            await load();
          }}
        />
      )}

      {detailsTarget && (
        <TurmaDetailsModal
          turma={detailsTarget}
          teacherName={detailsTarget._teacherName}
          onClose={() => setDetailsTarget(null)}
        />
      )}

      {toDelete && !isProfessor && (
        <ConfirmDeleteModal
          title="Remover turma"
          itemName={toDelete.name}
          description="Os vínculos de alunos e sessões relacionadas podem ser afetados."
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await financeGateway.deleteTurma(toDelete.id);
            setToDelete(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ─── Modal: Criar/Editar turma ───────────────────────────────────
function TurmaFormModal({ initial, teachers, onClose, onSaved }) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [teacherId, setTeacherId] = useState(initial?.teacher_id || "");
  const [capacity, setCapacity] = useState(String(initial?.capacity || "10"));

  // Primeira meeting_rule (preview-style quick start)
  const firstRule = isEdit
    ? Array.isArray(initial?.meeting_rules) && initial.meeting_rules[0]
    : null;
  const [weekday, setWeekday] = useState(
    String(firstRule?.weekday ?? "1")
  );
  const [time, setTime] = useState(
    firstRule?.time ? String(firstRule.time).slice(0, 5) : "19:00"
  );
  const [durationHours, setDurationHours] = useState(
    String(firstRule?.duration_hours ?? "1")
  );

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    const trimmed = name.trim();
    if (!trimmed) return setErr("Nome é obrigatório.");
    if (!teacherId) return setErr("Professor é obrigatório.");
    try {
      setSaving(true);
      const payload = {
        name: trimmed,
        teacher_id: teacherId,
        capacity: Math.max(1, Number(capacity) || 10),
      };
      if (!isEdit && time) {
        payload.meeting_rules = [
          {
            weekday: Number(weekday),
            time,
            duration_hours: Number(durationHours) || 1,
          },
        ];
      }
      if (isEdit) {
        await financeGateway.updateTurma(initial.id, payload);
      } else {
        await financeGateway.createTurma(payload);
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
      title={isEdit ? "Editar turma" : "Nova turma"}
      onClose={saving ? () => {} : onClose}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Nome *
          </span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Turma Intermediário A"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">
              Professor *
            </span>
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
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
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </label>
        </div>

        {!isEdit && (
          <>
            <div className="text-xs font-medium text-[var(--p-text-muted)] -mb-2">
              Primeiro horário (opcional)
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[var(--p-text-muted)]">
                  Dia
                </span>
                <select
                  value={weekday}
                  onChange={(e) => setWeekday(e.target.value)}
                  className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
                >
                  {WEEKDAY_ABBR.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[var(--p-text-muted)]">
                  Horário
                </span>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-[var(--p-text-muted)]">
                  Duração (h)
                </span>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
                />
              </label>
            </div>
            <p className="text-[11px] text-[var(--p-text-faint)]">
              Você poderá adicionar mais horários depois na página da turma.
            </p>
          </>
        )}

        <ModalActions
          onCancel={onClose}
          submitting={saving}
          submitLabel={isEdit ? "Salvar" : "Cadastrar"}
        />
      </form>
    </AppModal>
  );
}

// ─── Modal: Gerenciar alunos da turma ────────────────────────────
function ManageMembersModal({ turma, allStudents, onClose, onChanged }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [addId, setAddId] = useState("");

  async function reload() {
    try {
      setError(null);
      setLoading(true);
      const m = await financeGateway.listTurmaMembers(turma.id);
      setMembers(Array.isArray(m) ? m : []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turma.id]);

  const candidates = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id));
    return allStudents.filter((s) => !memberIds.has(s.id));
  }, [members, allStudents]);

  async function onAdd() {
    if (!addId) return;
    try {
      setBusy(addId);
      await financeGateway.addStudentToTurma(turma.id, addId);
      setAddId("");
      await reload();
      await onChanged?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(studentId) {
    try {
      setBusy(studentId);
      await financeGateway.removeStudentFromTurma(turma.id, studentId);
      await reload();
      await onChanged?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppModal
      title={`Alunos · ${turma.name}`}
      onClose={onClose}
      maxWidth="2xl"
    >
      <div className="flex flex-col gap-4 px-5 py-5">
        <FormError message={error} />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">
              Adicionar aluno
            </span>
            <select
              value={addId}
              onChange={(e) => setAddId(e.target.value)}
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            >
              <option value="">— selecione —</option>
              {candidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={onAdd}
            disabled={!addId || busy === addId}
            className="p-btn p-btn-primary"
          >
            {busy === addId ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Adicionar
          </button>
        </div>

        <div className="rounded-lg border border-[var(--p-border)] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-8 text-xs text-[var(--p-text-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
            </div>
          ) : members.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-[var(--p-text-muted)]">
              Nenhum aluno nesta turma.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--p-border)]">
              {members.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: colorFor(s.name) }}
                    >
                      {String(s.name || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {s.name || "—"}
                      </div>
                      <div className="text-[11px] text-[var(--p-text-muted)]">
                        {s.status || "—"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(s.id)}
                    disabled={busy === s.id}
                    className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)] disabled:opacity-50"
                    aria-label="Remover"
                    title="Remover"
                  >
                    {busy === s.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="p-btn p-btn-ghost">
            Fechar
          </button>
        </div>
      </div>
    </AppModal>
  );
}

// ─── Modal: Detalhes da turma + sessões + presença ───────────────
function ymOf(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthRange(ym) {
  const [Y, M] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const last = new Date(Y, M, 0).getDate();
  const end = `${ym}-${String(last).padStart(2, "0")}`;
  return { start, end };
}
function fmtSessionDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) +
    " · " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

function TurmaDetailsModal({ turma, teacherName, onClose }) {
  const [members, setMembers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [ym, setYm] = useState(ymOf());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [attendanceBySession, setAttendanceBySession] = useState({});
  const [savingAtt, setSavingAtt] = useState(null);
  const [showNew, setShowNew] = useState(false);

  async function load() {
    try {
      setError(null);
      setLoading(true);
      const { start, end } = monthRange(ym);
      const [mem, sess] = await Promise.all([
        financeGateway.listTurmaMembers(turma.id),
        financeGateway.listSessionsWithAttendance({
          turmaId: turma.id,
          start,
          end,
        }),
      ]);
      setMembers(Array.isArray(mem) ? mem : []);
      setSessions(Array.isArray(sess) ? sess : []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turma.id, ym]);

  async function loadAttendance(sessionId) {
    try {
      const att = await financeGateway.listAttendance(sessionId);
      const map = {};
      for (const a of att || [])
        map[a.student_id] = { present: !!a.present, note: a.note || "" };
      setAttendanceBySession((prev) => ({ ...prev, [sessionId]: map }));
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  function toggleExpand(sessionId) {
    if (expanded === sessionId) {
      setExpanded(null);
      return;
    }
    setExpanded(sessionId);
    if (!attendanceBySession[sessionId]) loadAttendance(sessionId);
  }

  async function handleTogglePresence(sessionId, studentId, present) {
    setSavingAtt(`${sessionId}:${studentId}`);
    try {
      const prev = attendanceBySession[sessionId]?.[studentId] || {};
      await financeGateway.upsertAttendance(sessionId, studentId, {
        present,
        note: prev.note || null,
      });
      setAttendanceBySession((s) => ({
        ...s,
        [sessionId]: {
          ...(s[sessionId] || {}),
          [studentId]: { ...prev, present },
        },
      }));
      setSessions((rows) =>
        rows.map((r) =>
          r.id === sessionId ? { ...r, has_attendance: true } : r
        )
      );
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSavingAtt(null);
    }
  }

  return (
    <AppModal title={turma.name || "Turma"} onClose={onClose} maxWidth="3xl">
      <div className="flex flex-col gap-5 px-5 py-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Info label="Professor" value={teacherName || "—"} />
          <Info label="Capacidade" value={String(turma.capacity || "—")} />
          <Info label="Alunos" value={String(members.length)} />
          <Info label="Aulas no mês" value={String(sessions.length)} />
        </div>

        <FormError message={error} />

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Registro de aulas</h3>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={ym}
                onChange={(e) => setYm(e.target.value)}
                className="rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="p-btn p-btn-ghost text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Nova aula
              </button>
            </div>
          </div>

          {showNew && (
            <NewSessionForm
              turmaId={turma.id}
              members={members}
              defaultDuration={turma.meeting_rules?.[0]?.duration_hours || 1}
              onCancel={() => setShowNew(false)}
              onCreated={async () => {
                setShowNew(false);
                await load();
              }}
            />
          )}

          {loading ? (
            <div className="flex items-center gap-2 px-2 py-6 text-sm text-[var(--p-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando aulas…
            </div>
          ) : sessions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--p-border)] px-4 py-6 text-center text-xs text-[var(--p-text-muted)]">
              Nenhuma aula cadastrada nesse mês.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {sessions.map((s) => {
                const isOpen = expanded === s.id;
                const att = attendanceBySession[s.id] || {};
                const presentCount = Object.values(att).filter(
                  (a) => a.present
                ).length;
                return (
                  <li
                    key={s.id}
                    className="rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)]"
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpand(s.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--p-surface-2)]"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Calendar className="h-4 w-4 text-[var(--p-text-muted)]" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {fmtSessionDate(s.date)}
                          </div>
                          <div className="text-xs text-[var(--p-text-muted)]">
                            {Number(s.duration_hours || 0)}h
                            {s.has_attendance
                              ? " · presença registrada"
                              : " · sem presença"}
                          </div>
                        </div>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="border-t border-[var(--p-border)] px-4 py-3">
                        {members.length === 0 ? (
                          <div className="text-xs text-[var(--p-text-muted)]">
                            A turma ainda não tem alunos vinculados.
                          </div>
                        ) : (
                          <>
                            <div className="mb-2 text-xs text-[var(--p-text-muted)]">
                              Presentes:{" "}
                              <span className="font-medium tabular-nums">
                                {presentCount}/{members.length}
                              </span>
                            </div>
                            <ul className="flex flex-col divide-y divide-[var(--p-border)]">
                              {members.map((m) => {
                                const row = att[m.id] || {
                                  present: false,
                                  note: "",
                                };
                                const busy = savingAtt === `${s.id}:${m.id}`;
                                return (
                                  <li
                                    key={m.id}
                                    className="flex items-center justify-between gap-3 py-2"
                                  >
                                    <div className="flex min-w-0 items-center gap-2">
                                      <div
                                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
                                        style={{
                                          background: colorFor(m.name),
                                        }}
                                      >
                                        {String(m.name || "?")
                                          .slice(0, 1)
                                          .toUpperCase()}
                                      </div>
                                      <span className="truncate text-sm">
                                        {m.name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          handleTogglePresence(
                                            s.id,
                                            m.id,
                                            true
                                          )
                                        }
                                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                                          row.present
                                            ? "bg-[var(--p-success-50)] text-[var(--p-success)]"
                                            : "text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]"
                                        }`}
                                      >
                                        <Check className="h-3 w-3" /> Presente
                                      </button>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                          handleTogglePresence(
                                            s.id,
                                            m.id,
                                            false
                                          )
                                        }
                                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                                          !row.present && att[m.id]
                                            ? "bg-[var(--p-danger-50)] text-[var(--p-danger)]"
                                            : "text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]"
                                        }`}
                                      >
                                        Falta
                                      </button>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppModal>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-[var(--p-text-faint)]">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium truncate">{value}</div>
    </div>
  );
}

function NewSessionForm({
  turmaId,
  members,
  defaultDuration,
  onCancel,
  onCreated,
}) {
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 16)
  );
  const [durationHours, setDurationHours] = useState(
    String(defaultDuration || 1)
  );
  const [notes, setNotes] = useState("");
  const [presence, setPresence] = useState(() => {
    const init = {};
    for (const m of members || []) init[m.id] = true;
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const presentCount = Object.values(presence).filter(Boolean).length;

  function setAll(value) {
    const next = {};
    for (const m of members || []) next[m.id] = value;
    setPresence(next);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    if (!date) {
      setErr("Data é obrigatória");
      return;
    }
    try {
      setSaving(true);
      const session = await financeGateway.createSession({
        turma_id: turmaId,
        date,
        duration_hours: Number(durationHours) || 1,
        notes,
      });
      const sessionId = session?.id;
      if (sessionId && (members || []).length > 0) {
        await Promise.all(
          members.map((m) =>
            financeGateway.upsertAttendance(sessionId, m.id, {
              present: !!presence[m.id],
              note: null,
            })
          )
        );
      }
      await onCreated();
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-2)] px-3 py-3"
    >
      <FormError message={err} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Data e hora *
          </span>
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Duração (h)
          </span>
          <input
            type="number"
            step="0.5"
            min="0.5"
            value={durationHours}
            onChange={(e) => setDurationHours(e.target.value)}
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Observações
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opcional"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-[var(--p-text-muted)]">
            Presença ({presentCount}/{(members || []).length})
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
              Desmarcar todos
            </button>
          </div>
        </div>
        {(members || []).length === 0 ? (
          <div className="text-xs text-[var(--p-text-muted)]">
            A turma ainda não tem alunos vinculados.
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--p-border)]">
            {members.map((m) => {
              const present = !!presence[m.id];
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: colorFor(m.name) }}
                    >
                      {String(m.name || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <span className="truncate text-sm">{m.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setPresence((p) => ({ ...p, [m.id]: true }))
                      }
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                        present
                          ? "bg-[var(--p-success-50)] text-[var(--p-success)]"
                          : "text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]"
                      }`}
                    >
                      <Check className="h-3 w-3" /> Presente
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPresence((p) => ({ ...p, [m.id]: false }))
                      }
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                        !present
                          ? "bg-[var(--p-danger-50)] text-[var(--p-danger)]"
                          : "text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]"
                      }`}
                    >
                      Falta
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ModalActions
        onCancel={onCancel}
        submitting={saving}
        submitLabel="Cadastrar aula"
      />
    </form>
  );
}

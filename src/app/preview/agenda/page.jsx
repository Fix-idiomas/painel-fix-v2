"use client";

import { useEffect, useMemo, useState } from "react";
import PreviewShell from "../_components/PreviewShell";
import PreviewModal, { FormError, ModalActions } from "../_components/PreviewModal";
import { financeGateway } from "@/lib/financeGateway";
import {
  buildEventsFromRules,
  buildEventsFromSessions,
  colorFor,
  hourToMinutes,
  localDateTimeForGridSlot,
} from "@/lib/agendaEvents";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  Users,
  MapPin,
  Loader2,
  Check,
  Trash2,
} from "lucide-react";

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAYS_LONG = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const HOURS = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"];

function startOfGridMinutes() { return 8 * 60; }
function endOfGridMinutes()   { return 21 * 60; }
function hoursBetween(start, end) {
  const diff = hourToMinutes(end) - hourToMinutes(start);
  return Math.max(0.25, Math.round((diff / 60) * 4) / 4);
}

function mondayOfThisWeek() {
  const d = new Date();
  const dow = d.getDay(); // 0=Sun..6=Sat
  const back = (dow + 6) % 7; // days since Monday
  d.setDate(d.getDate() - back);
  d.setHours(0, 0, 0, 0);
  return d;
}
function todayDayIdx() {
  // Grid is Mon..Sat → index 0..5. Sunday falls back to Monday.
  const dow = new Date().getDay(); // 0=Sun..6=Sat
  if (dow === 0) return 0;
  return dow - 1;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function fmtRange(start, endInclusive) {
  const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const sm = start.getMonth();
  const em = endInclusive.getMonth();
  if (sm === em) {
    return `Semana de ${start.getDate()}–${endInclusive.getDate()} de ${MONTHS[sm]}`;
  }
  return `${start.getDate()} de ${MONTHS[sm]} – ${endInclusive.getDate()} de ${MONTHS[em]}`;
}

export default function AgendaPreview() {
  const [view, setView] = useState("day");
  const [day, setDay] = useState(todayDayIdx);
  const [weekStart, setWeekStart] = useState(mondayOfThisWeek());
  const [turmas, setTurmas] = useState([]);
  const [teacherMap, setTeacherMap] = useState({});
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newPrefill, setNewPrefill] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const loadStatic = async () => {
    const [tu, teachers] = await Promise.all([
      financeGateway.listTurmas(),
      financeGateway.listTeachers(),
    ]);
    setTurmas(Array.isArray(tu) ? tu : []);
    const map = {};
    for (const t of teachers || []) map[t.id] = t.name;
    setTeacherMap(map);
  };

  const loadSessionsForWeek = async (start) => {
    const startISO = new Date(start).toISOString();
    const endDate = addDays(start, 6);
    endDate.setHours(0, 0, 0, 0);
    const endISO = endDate.toISOString();
    const data = await financeGateway.listSessionsInRange({ start: startISO, end: endISO });
    setSessions(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        setError(null);
        await loadStatic();
        await loadSessionsForWeek(weekStart);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [weekStart]);

  async function load() {
    try {
      setError(null);
      await loadStatic();
      await loadSessionsForWeek(weekStart);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  const turmaMap = useMemo(() => {
    const m = {};
    for (const t of turmas) m[t.id] = t;
    return m;
  }, [turmas]);

  const events = useMemo(() => {
    const sessionEvents = buildEventsFromSessions(sessions, turmaMap, teacherMap, weekStart);
    if (sessionEvents.length > 0) return sessionEvents;
    return buildEventsFromRules(turmas, teacherMap);
  }, [sessions, turmas, turmaMap, teacherMap, weekStart]);
  const classesForDay = (idx) => events.filter((c) => c.day === idx).sort((a, b) => a.start.localeCompare(b.start));
  const totalMin = endOfGridMinutes() - startOfGridMinutes();

  function handleEventClick(ev) {
    if (ev.kind === "session") {
      const id = String(ev.id || "").replace(/^session-/, "");
      setSelectedSessionId(id);
      return;
    }
    // rule event → open NewSessionModal prefilled
    const turmaId = String(ev.id || "").replace(/^rule-/, "").split("-")[0];
    setNewPrefill({
      turma_id: turmaId,
      datetime: localDateTimeForGridSlot(weekStart, ev.day, ev.start),
      duration_hours: hoursBetween(ev.start, ev.end),
    });
    setModalOpen(true);
  }

  const weekEnd = addDays(weekStart, 5);
  const teachersCount = new Set(events.map((e) => e.teacher)).size;
  const roomsCount = new Set(events.map((e) => e.room).filter((r) => r && r !== "—")).size;

  return (
    <PreviewShell
      active="agenda"
      crumb="Planejamento"
      title="Agenda"
      rightAction={
        <button className="p-btn p-btn-primary" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova aula</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {fmtRange(weekStart, weekEnd)}
            </h1>
            <p className="mt-1 text-sm text-[var(--p-text-muted)]">
              {loading
                ? "Carregando…"
                : `${events.length} aulas por semana · ${teachersCount} professores · ${roomsCount} salas`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] p-1 text-xs">
              <button
                onClick={() => setView("week")}
                className={[
                  "rounded-md px-3 py-1 transition-colors",
                  view === "week" ? "bg-[var(--p-primary)] text-white" : "text-[var(--p-text-muted)] hover:text-[var(--p-text)]",
                ].join(" ")}
              >
                Semana
              </button>
              <button
                onClick={() => setView("day")}
                className={[
                  "rounded-md px-3 py-1 transition-colors",
                  view === "day" ? "bg-[var(--p-primary)] text-white" : "text-[var(--p-text-muted)] hover:text-[var(--p-text)]",
                ].join(" ")}
              >
                Dia
              </button>
            </div>
            <div className="inline-flex items-center rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)]">
              <button
                onClick={() => setWeekStart((w) => addDays(w, -7))}
                className="p-2 hover:bg-[var(--p-surface-2)] rounded-l-lg"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setWeekStart(mondayOfThisWeek())}
                className="px-3 py-1.5 text-xs font-medium border-x border-[var(--p-border)] hover:bg-[var(--p-surface-2)]"
              >
                Hoje
              </button>
              <button
                onClick={() => setWeekStart((w) => addDays(w, 7))}
                className="p-2 hover:bg-[var(--p-surface-2)] rounded-r-lg"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
            Erro ao carregar agenda: {error}
          </div>
        )}

        {loading ? (
          <div className="p-card flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando agenda…
          </div>
        ) : events.length === 0 ? (
          <div className="p-card flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--p-surface-2)] text-[var(--p-text-muted)]">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium">Nenhuma aula programada</div>
            <div className="text-xs text-[var(--p-text-muted)]">
              Configure horários nas turmas para ver a grade aqui.
            </div>
          </div>
        ) : (
          <>
            {view === "day" && (
              <div className="mb-4 grid grid-cols-6 gap-1 md:hidden">
                {DAYS.map((d, i) => {
                  const active = day === i;
                  const n = addDays(weekStart, i).getDate();
                  return (
                    <button
                      key={d}
                      onClick={() => setDay(i)}
                      className={[
                        "flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-xs transition-colors",
                        active
                          ? "bg-[var(--p-primary)] text-white"
                          : "bg-[var(--p-surface)] border border-[var(--p-border)] text-[var(--p-text-muted)]",
                      ].join(" ")}
                    >
                      <span className="uppercase tracking-wider text-[10px]">{d}</span>
                      <span className={`text-base font-semibold tabular-nums ${active ? "text-white" : "text-[var(--p-text)]"}`}>{n}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {view === "week" && (
              <>
                <div className="p-card hidden md:block overflow-hidden">
                  <div className="grid grid-cols-[60px_repeat(6,1fr)] border-b border-[var(--p-border)] bg-[var(--p-surface-2)]">
                    <div className="px-2 py-3"></div>
                    {DAYS.map((d, i) => (
                      <div key={d} className="px-3 py-3 border-l border-[var(--p-border)]">
                        <div className="text-[10px] uppercase tracking-wider text-[var(--p-text-faint)]">{d}</div>
                        <div className="text-sm font-semibold tabular-nums">{addDays(weekStart, i).getDate()}</div>
                      </div>
                    ))}
                  </div>
                  <div className="relative grid grid-cols-[60px_repeat(6,1fr)]" style={{ minHeight: "720px" }}>
                    <div className="relative">
                      {HOURS.map((h) => (
                        <div
                          key={h}
                          className="absolute left-0 right-0 flex items-start justify-end pr-2 text-[10px] font-medium tabular-nums text-[var(--p-text-faint)]"
                          style={{ top: `${((hourToMinutes(h + ":00") - startOfGridMinutes()) / totalMin) * 100}%` }}
                        >
                          {h}:00
                        </div>
                      ))}
                    </div>
                    {DAYS.map((d, dIdx) => (
                      <div key={d} className="relative border-l border-[var(--p-border)]">
                        {HOURS.map((h) => (
                          <div
                            key={h}
                            className="absolute left-0 right-0 border-t border-dashed border-[var(--p-border)]"
                            style={{ top: `${((hourToMinutes(h + ":00") - startOfGridMinutes()) / totalMin) * 100}%` }}
                          />
                        ))}
                        {classesForDay(dIdx).map((c) => {
                          const top = ((hourToMinutes(c.start) - startOfGridMinutes()) / totalMin) * 100;
                          const height = ((hourToMinutes(c.end) - hourToMinutes(c.start)) / totalMin) * 100;
                          return (
                            <button
                              type="button"
                              key={c.id}
                              onClick={() => handleEventClick(c)}
                              className="absolute left-1 right-1 overflow-hidden rounded-md px-2 py-1.5 text-left text-white shadow-sm hover:shadow-md hover:brightness-110 transition cursor-pointer"
                              style={{ top: `${top}%`, height: `${height}%`, background: c.color, minHeight: "32px" }}
                            >
                              <div className="text-xs font-semibold leading-tight truncate">{c.title}</div>
                              <div className="text-[10px] opacity-90 leading-tight truncate">
                                {c.start} · {c.room}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="md:hidden">
                  <DayList list={classesForDay(day)} onClick={handleEventClick} />
                  <div className="mt-3 text-center">
                    <button
                      onClick={() => setView("day")}
                      className="text-xs text-[var(--p-text-muted)] underline"
                    >
                      Ver por dia
                    </button>
                  </div>
                </div>
              </>
            )}

            {view === "day" && (
              <>
                <div className="hidden md:flex mb-3 gap-1 flex-wrap">
                  {DAYS_LONG.map((d, i) => {
                    const active = day === i;
                    return (
                      <button
                        key={d}
                        onClick={() => setDay(i)}
                        className={[
                          "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                          active ? "bg-[var(--p-primary)] text-white" : "bg-[var(--p-surface)] border border-[var(--p-border)] text-[var(--p-text-muted)]",
                        ].join(" ")}
                      >
                        {d} <span className="tabular-nums opacity-70">{addDays(weekStart, i).getDate()}</span>
                      </button>
                    );
                  })}
                </div>
                <DayList list={classesForDay(day)} onClick={handleEventClick} />
              </>
            )}
          </>
        )}
      </div>

      {modalOpen && (
        <NewSessionModal
          turmas={turmas}
          prefill={newPrefill}
          onClose={() => { setModalOpen(false); setNewPrefill(null); }}
          onCreated={async () => {
            setModalOpen(false);
            setNewPrefill(null);
            await load();
          }}
        />
      )}

      {selectedSessionId && (
        <SessionDetailsModal
          sessionId={selectedSessionId}
          turmaMap={turmaMap}
          teacherMap={teacherMap}
          onClose={() => setSelectedSessionId(null)}
          onChanged={async () => { await load(); }}
          onDeleted={async () => { setSelectedSessionId(null); await load(); }}
        />
      )}
    </PreviewShell>
  );
}

function NewSessionModal({ turmas, prefill, onClose, onCreated }) {
  const initialDate = prefill?.datetime?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const initialTime = prefill?.datetime?.slice(11, 16) || "19:00";
  const [turmaId, setTurmaId] = useState(prefill?.turma_id || turmas?.[0]?.id || "");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [durationHours, setDurationHours] = useState(String(prefill?.duration_hours || 1));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    if (!turmaId) { setErr("Selecione uma turma"); return; }
    if (!date) { setErr("Data é obrigatória"); return; }
    try {
      setSaving(true);
      const isoDate = `${date}T${time}:00`;
      await financeGateway.createSession({
        turma_id: turmaId,
        date: isoDate,
        duration_hours: Number(durationHours) || 1,
        notes: notes.trim(),
      });
      await onCreated();
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PreviewModal title="Nova aula" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">Turma *</span>
          <select
            autoFocus
            value={turmaId}
            onChange={(e) => setTurmaId(e.target.value)}
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          >
            <option value="">Selecione…</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">Data *</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">Horário</span>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">Duração (horas)</span>
          <input
            type="number"
            step="0.5"
            min="0.5"
            value={durationHours}
            onChange={(e) => setDurationHours(e.target.value)}
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">Notas</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Opcional"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <ModalActions onCancel={onClose} submitting={saving} submitLabel="Cadastrar" submitIcon={saving ? Loader2 : Plus} />
      </form>
    </PreviewModal>
  );
}

function DayList({ list, onClick }) {
  if (!list || list.length === 0) {
    return (
      <div className="p-card flex flex-col items-center justify-center gap-2 p-8 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--p-surface-2)] text-[var(--p-text-muted)]">
          <Calendar className="h-5 w-5" />
        </div>
        <div className="text-sm font-medium">Sem aulas neste dia</div>
      </div>
    );
  }
  return (
    <div className="p-card divide-y divide-[var(--p-border)]">
      {list.map((c) => (
        <button
          type="button"
          key={c.id}
          onClick={() => onClick?.(c)}
          className="flex w-full items-stretch gap-3 px-4 py-3 text-left hover:bg-[var(--p-surface-2)] transition-colors"
        >
          <div className="w-1 shrink-0 rounded-full" style={{ background: c.color }} />
          <div className="flex w-16 flex-col">
            <div className="text-sm font-semibold tabular-nums">{c.start}</div>
            <div className="text-xs text-[var(--p-text-faint)] tabular-nums">{c.end}</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{c.title}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--p-text-muted)]">
              {c.capacity > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" /> até {c.capacity}
                </span>
              )}
              {c.room && c.room !== "—" && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {c.room}
                </span>
              )}
              <span>Prof. {c.teacher}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function fmtSessionDateLong(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) +
    " · " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function SessionDetailsModal({ sessionId, turmaMap, teacherMap, onClose, onChanged, onDeleted }) {
  const [session, setSession] = useState(null);
  const [members, setMembers] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingAtt, setSavingAtt] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const found = await financeGateway.getSession(sessionId);
        if (!found) throw new Error("Aula não encontrada");
        if (cancelled) return;
        setSession(found);
        const [mem, att] = await Promise.all([
          financeGateway.listTurmaMembers(found.turma_id),
          financeGateway.listAttendance(found.id),
        ]);
        if (cancelled) return;
        setMembers(Array.isArray(mem) ? mem : []);
        const map = {};
        for (const a of att || []) map[a.student_id] = { present: !!a.present, note: a.note || "" };
        setAttendance(map);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const turma = session ? turmaMap[session.turma_id] || {} : {};
  const teacher = turma.teacher_id ? teacherMap[turma.teacher_id] || "—" : "Sem professor";
  const presentCount = Object.values(attendance).filter((a) => a.present).length;

  async function togglePresence(studentId, present) {
    if (!session) return;
    setSavingAtt(studentId);
    try {
      const prev = attendance[studentId] || {};
      await financeGateway.upsertAttendance(session.id, studentId, { present, note: prev.note || null });
      setAttendance((s) => ({ ...s, [studentId]: { ...prev, present } }));
      await onChanged?.();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSavingAtt(null);
    }
  }

  async function handleDelete() {
    if (!session) return;
    setDeleting(true);
    try {
      await financeGateway.deleteSession(session.id);
      await onDeleted?.();
    } catch (e) {
      setError(e?.message || String(e));
      setDeleting(false);
    }
  }

  return (
    <PreviewModal title={turma.name || "Aula"} onClose={onClose} maxWidth="2xl">
      <div className="flex flex-col gap-4 px-5 py-5">
        <FormError message={error} />
        {loading || !session ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[var(--p-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando aula…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Info label="Quando" value={fmtSessionDateLong(session.date)} />
              <Info label="Duração" value={`${Number(session.duration_hours || 0)}h`} />
              <Info label="Professor" value={teacher} />
              <Info label="Alunos" value={String(members.length)} />
            </div>

            {session.notes && (
              <div className="rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-2)] px-3 py-2 text-xs text-[var(--p-text-muted)]">
                {session.notes}
              </div>
            )}

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Presença</h3>
                <div className="text-xs text-[var(--p-text-muted)] tabular-nums">
                  {presentCount}/{members.length}
                </div>
              </div>
              {members.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--p-border)] px-4 py-4 text-center text-xs text-[var(--p-text-muted)]">
                  A turma ainda não tem alunos vinculados.
                </div>
              ) : (
                <ul className="flex flex-col divide-y divide-[var(--p-border)]">
                  {members.map((m) => {
                    const row = attendance[m.id] || { present: false, note: "" };
                    const busy = savingAtt === m.id;
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-3 py-2">
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
                            disabled={busy}
                            onClick={() => togglePresence(m.id, true)}
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
                            onClick={() => togglePresence(m.id, false)}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                              !row.present && attendance[m.id]
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
            </section>

            <div className="flex items-center justify-between border-t border-[var(--p-border)] pt-4">
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--p-danger)]">Confirmar exclusão?</span>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDelete}
                    className="inline-flex items-center gap-1 rounded-md bg-[var(--p-danger)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--p-danger)]/90 disabled:opacity-60"
                  >
                    {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    Excluir
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs text-[var(--p-text-muted)]">
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1 text-xs text-[var(--p-danger)] hover:underline"
                >
                  <Trash2 className="h-3 w-3" /> Excluir aula
                </button>
              )}
              <button type="button" onClick={onClose} className="p-btn p-btn-ghost text-xs">
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </PreviewModal>
  );
}

function Info({ label, value }) {
  return (
    <div className="rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-[var(--p-text-faint)]">{label}</div>
      <div className="mt-0.5 text-sm font-medium truncate">{value}</div>
    </div>
  );
}

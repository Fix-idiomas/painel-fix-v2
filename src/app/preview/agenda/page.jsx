"use client";

import { useEffect, useMemo, useState } from "react";
import PreviewShell from "../_components/PreviewShell";
import PreviewModal, { FormError, ModalActions } from "../_components/PreviewModal";
import { financeGateway } from "@/lib/financeGateway";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  Users,
  MapPin,
  Loader2,
} from "lucide-react";

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAYS_LONG = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const HOURS = ["08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20"];

const COLOR_PALETTE = [
  "#8B1C2C", "#E94F37", "#0F766E", "#D97706", "#1E40AF",
  "#7C3AED", "#BE123C", "#0891B2", "#15803D", "#9333EA", "#DC2626", "#059669",
];

function colorFor(seed) {
  const s = String(seed || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

function hourToMinutes(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}
function startOfGridMinutes() { return 8 * 60; }
function endOfGridMinutes()   { return 21 * 60; }

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

// Turma.meeting_rules.weekday uses 0=Sun..6=Sat. Preview grid is Mon..Sat → index 0..5.
function weekdayToColIdx(weekday) {
  const w = Number(weekday);
  if (!Number.isFinite(w)) return -1;
  if (w === 0) return -1; // skip Sunday
  return w - 1;
}

function buildEvents(turmas, teacherMap) {
  const events = [];
  for (const t of turmas || []) {
    const rules = Array.isArray(t.meeting_rules) ? t.meeting_rules : [];
    for (const r of rules) {
      const col = weekdayToColIdx(r.weekday);
      if (col < 0) continue;
      const time = String(r.time || t.meeting_time || "08:00").slice(0, 5);
      const dur = Math.max(0.25, Number(r.duration_hours || 1));
      const endMin = hourToMinutes(time) + Math.round(dur * 60);
      const endH = Math.floor(endMin / 60);
      const endM = endMin % 60;
      const endStr = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
      events.push({
        id: `${t.id}-${r.weekday}-${time}`,
        day: col,
        start: time,
        end: endStr,
        title: t.name || "—",
        teacher: t.teacher_id ? teacherMap[t.teacher_id] || "—" : "Sem professor",
        room: t.room || "—",
        students: 0,
        color: colorFor(t.name || t.id),
        capacity: Number(t.capacity || 0),
      });
    }
  }
  return events;
}

export default function AgendaPreview() {
  const [view, setView] = useState("day");
  const [day, setDay] = useState(todayDayIdx);
  const [weekStart, setWeekStart] = useState(mondayOfThisWeek());
  const [turmas, setTurmas] = useState([]);
  const [teacherMap, setTeacherMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function load() {
    try {
      setError(null);
      const [tu, teachers] = await Promise.all([
        financeGateway.listTurmas(),
        financeGateway.listTeachers(),
      ]);
      setTurmas(Array.isArray(tu) ? tu : []);
      const map = {};
      for (const t of teachers || []) map[t.id] = t.name;
      setTeacherMap(map);
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
  }, []);

  const events = useMemo(() => buildEvents(turmas, teacherMap), [turmas, teacherMap]);
  const classesForDay = (idx) => events.filter((c) => c.day === idx).sort((a, b) => a.start.localeCompare(b.start));
  const totalMin = endOfGridMinutes() - startOfGridMinutes();

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
                            <div
                              key={c.id}
                              className="absolute left-1 right-1 overflow-hidden rounded-md px-2 py-1.5 text-white shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                              style={{ top: `${top}%`, height: `${height}%`, background: c.color, minHeight: "32px" }}
                            >
                              <div className="text-xs font-semibold leading-tight truncate">{c.title}</div>
                              <div className="text-[10px] opacity-90 leading-tight truncate">
                                {c.start} · {c.room}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="md:hidden">
                  <DayList list={classesForDay(day)} />
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
                <DayList list={classesForDay(day)} />
              </>
            )}
          </>
        )}
      </div>

      {modalOpen && (
        <NewSessionModal
          turmas={turmas}
          onClose={() => setModalOpen(false)}
          onCreated={async () => {
            setModalOpen(false);
            await load();
          }}
        />
      )}
    </PreviewShell>
  );
}

function NewSessionModal({ turmas, onClose, onCreated }) {
  const [turmaId, setTurmaId] = useState(turmas?.[0]?.id || "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("19:00");
  const [durationHours, setDurationHours] = useState("1");
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

function DayList({ list }) {
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
        <div key={c.id} className="flex items-stretch gap-3 px-4 py-3">
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
        </div>
      ))}
    </div>
  );
}

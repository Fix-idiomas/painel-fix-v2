// Pure helpers that turn turmas / sessions into events for the preview agenda grid.
// Grid columns are Mon..Sat → indexes 0..5. Sundays are skipped.

const COLOR_PALETTE = [
  "#8B1C2C", "#E94F37", "#0F766E", "#D97706", "#1E40AF",
  "#7C3AED", "#BE123C", "#0891B2", "#15803D", "#9333EA", "#DC2626", "#059669",
];

export interface AgendaEvent {
  id: string;
  kind: "rule" | "session";
  day: number;
  start: string;
  end: string;
  title: string;
  teacher: string;
  room: string;
  students: number;
  color: string;
  capacity: number;
}

interface TurmaLike {
  id: string;
  name?: string | null;
  teacher_id?: string | null;
  capacity?: number | null;
  room?: string | null;
  meeting_time?: string | null;
  meeting_rules?: Array<{ weekday?: number | string | null; time?: string | null; duration_hours?: number | null }> | null;
}

interface SessionLike {
  id: string;
  turma_id: string;
  date: string | null;
  duration_hours?: number | null;
}

export function colorFor(seed: string | null | undefined): string {
  const s = String(seed || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

export function hourToMinutes(hhmm: string | null | undefined): number {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

// 0=Sun..6=Sat → 0..5 (Mon..Sat). Sunday returns -1 (skipped).
export function weekdayToColIdx(weekday: number | string | null | undefined): number {
  const w = Number(weekday);
  if (!Number.isFinite(w)) return -1;
  if (w === 0) return -1;
  return w - 1;
}

function teacherName(turma: TurmaLike, teacherMap: Record<string, string>): string {
  if (!turma.teacher_id) return "Sem professor";
  return teacherMap[turma.teacher_id] || "—";
}

function fmtHHMM(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function buildEventsFromRules(
  turmas: TurmaLike[] | null | undefined,
  teacherMap: Record<string, string>,
): AgendaEvent[] {
  const events: AgendaEvent[] = [];
  for (const t of turmas || []) {
    const rules = Array.isArray(t.meeting_rules) ? t.meeting_rules : [];
    for (const r of rules) {
      const col = weekdayToColIdx(r.weekday);
      if (col < 0) continue;
      const time = String(r.time || t.meeting_time || "08:00").slice(0, 5);
      const dur = Math.max(0.25, Number(r.duration_hours || 1));
      const endStr = fmtHHMM(hourToMinutes(time) + Math.round(dur * 60));
      events.push({
        id: `rule-${t.id}-${r.weekday}-${time}`,
        kind: "rule",
        day: col,
        start: time,
        end: endStr,
        title: t.name || "—",
        teacher: teacherName(t, teacherMap),
        room: t.room || "—",
        students: 0,
        color: colorFor(t.name || t.id),
        capacity: Number(t.capacity || 0),
      });
    }
  }
  return events;
}

// Resolves the local datetime for a rule-click in the agenda grid.
// dayIdx is 0..5 (Mon..Sat); time is "HH:MM". Returns "YYYY-MM-DDTHH:MM" suitable
// for an <input type="datetime-local"> default and for createSession.
export function localDateTimeForGridSlot(
  weekStart: Date | string,
  dayIdx: number,
  time: string | null | undefined,
): string {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + dayIdx);
  const [h, m] = String(time || "08:00").split(":").map(Number);
  if (Number.isFinite(h)) start.setHours(h);
  if (Number.isFinite(m)) start.setMinutes(m);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
}

export function buildEventsFromSessions(
  sessions: SessionLike[] | null | undefined,
  turmaMap: Record<string, TurmaLike>,
  teacherMap: Record<string, string>,
  weekStart: Date | string,
): AgendaEvent[] {
  const events: AgendaEvent[] = [];
  const startDate = new Date(weekStart);
  startDate.setHours(0, 0, 0, 0);
  const startMs = startDate.getTime();
  for (const s of sessions || []) {
    if (!s?.date) continue;
    const d = new Date(s.date);
    if (Number.isNaN(d.getTime())) continue;
    const diffDays = Math.floor((d.getTime() - startMs) / 86400000);
    if (diffDays < 0 || diffDays > 5) continue;
    const t = turmaMap[s.turma_id] || ({ id: s.turma_id } as TurmaLike);
    const start = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const dur = Math.max(0.25, Number(s.duration_hours || 1));
    const endStr = fmtHHMM(hourToMinutes(start) + Math.round(dur * 60));
    events.push({
      id: `session-${s.id}`,
      kind: "session",
      day: diffDays,
      start,
      end: endStr,
      title: t.name || "Aula",
      teacher: teacherName(t, teacherMap),
      room: t.room || "—",
      students: 0,
      color: colorFor(t.name || s.turma_id),
      capacity: Number(t.capacity || 0),
    });
  }
  return events;
}

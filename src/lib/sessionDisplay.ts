// Helpers de exibição/derivação de sessões (aulas), extraídos das páginas para
// permitir teste unitário. Regras de fuso: as datas de sessão são armazenadas em
// UTC; a escola opera em America/Sao_Paulo. `spYearMonth` é explícito no fuso;
// `fmtSessionDateWithRules` e `buildTodayClasses` usam a hora LOCAL do runtime
// (no navegador do usuário = SP) — nos testes, fixe `process.env.TZ`.

type MeetingRule = {
  weekday?: number | string | null;
  time?: string | null;
  duration_hours?: number | string | null;
};

/**
 * Ano-mês "YYYY-MM" no fuso America/Sao_Paulo — evita que aula noturna do
 * último/primeiro dia do mês caia no mês errado (a data é armazenada em UTC).
 */
export function spYearMonth(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const y = p.find((x) => x.type === "year")?.value;
  const m = p.find((x) => x.type === "month")?.value;
  return `${y}-${m}`;
}

/**
 * Igual ao fmtSessionDate, mas quando a sessão está sem hora (00:00) usa o
 * horário da grade da turma para aquele dia (fallback: horário predominante).
 * Assim a lista "Registro de aulas" não mostra meia-noite. (Correção de
 * exibição; a raiz fica na geração/backfill das sessões.)
 */
export function fmtSessionDateWithRules(
  iso: string | null | undefined,
  turma: { meeting_rules?: MeetingRule[] } | null | undefined
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const dateStr = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  let time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (time === "00:00") {
    const rules = Array.isArray(turma?.meeting_rules) ? turma!.meeting_rules! : [];
    const wd = d.getDay();
    const rule = rules.find((r) => Number(r?.weekday) === wd) || rules.find((r) => r?.time);
    if (rule?.time) time = String(rule.time).slice(0, 5);
  }
  return `${dateStr} · ${time}`;
}

type TurmaLite = {
  id: string;
  name?: string | null;
  meeting_rules?: MeetingRule[];
  meeting_time?: string | null;
  teacher_id?: string | null;
  room?: string | null;
};

type SessionLite = {
  id?: string;
  turma_id?: string;
  date?: string | null;
  has_attendance?: boolean;
};

export type TodayClass = {
  key: string;
  turma_id: string;
  turma_name: string;
  time: string;
  duration_h: number;
  teacher_name: string;
  room: string | null;
  session_id: string | null;
  has_attendance: boolean;
};

/**
 * Constrói a lista de aulas de hoje a partir das grades das turmas, casando cada
 * slot com a sessão registrada NESTE horário (turma com 2 aulas no mesmo dia não
 * compartilha a flag de chamada); fallback: qualquer sessão da turma hoje.
 */
export function buildTodayClasses(
  turmas: TurmaLite[] | null | undefined,
  teacherMap: Record<string, string>,
  todaySessions: SessionLite[] | null | undefined,
  todayDow: number
): TodayClass[] {
  const out: TodayClass[] = [];
  for (const t of turmas || []) {
    const rules = Array.isArray(t.meeting_rules) ? t.meeting_rules : [];
    for (const r of rules) {
      if (Number(r.weekday) !== todayDow) continue;
      const time = String(r.time || t.meeting_time || "08:00").slice(0, 5);
      const dur = Math.max(0.25, Number(r.duration_hours || 1));
      const sessAt = (s: SessionLite): string | null => {
        const d = new Date(s?.date as string);
        if (Number.isNaN(d.getTime())) return null;
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      };
      const matchingSession =
        (todaySessions || []).find(
          (s) => s.turma_id === t.id && sessAt(s) === time
        ) || (todaySessions || []).find((s) => s.turma_id === t.id);
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

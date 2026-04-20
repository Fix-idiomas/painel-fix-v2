import { eachDayOfInterval, parseISO } from "date-fns";
import type { Turma, MeetingRule } from "@/types";

export interface PlannedSlot extends MeetingRule {
  turma_id: string;
  teacher_id: string | null;
  planned: true;
  date: string;
  time: string;
}

export function plannedSlotsForRange(
  turma: Turma & { meeting_time?: string | null },
  startISO: string,
  endISO: string,
): PlannedSlot[] {
  if (!turma.meeting_rules || !Array.isArray(turma.meeting_rules)) return [];
  const start = parseISO(startISO);
  const end = parseISO(endISO);

  return turma.meeting_rules.flatMap((rule) => {
    const time =
      rule.time && typeof rule.time === "string" && /^\d{2}:\d{2}$/.test(rule.time)
        ? rule.time
        : turma.meeting_time || "08:00";
    return eachDayOfInterval({ start, end })
      .filter((day) => day.getDay() === rule.weekday)
      .map((day) => ({
        turma_id: turma.id,
        teacher_id: turma.teacher_id,
        planned: true as const,
        date: day.toISOString().slice(0, 10),
        time,
        ...rule,
      }));
  });
}

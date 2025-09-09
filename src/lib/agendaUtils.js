// src/lib/agendaUtils.js
import { eachDayOfInterval, parseISO } from "date-fns";

// Gera slots planejados para uma turma no intervalo [startISO, endISO]
export function plannedSlotsForRange(turma, startISO, endISO) {
  if (!turma.meeting_rules || !Array.isArray(turma.meeting_rules)) return [];
  const start = parseISO(startISO);
  const end = parseISO(endISO);

  // Para cada regra, gera os dias da semana no intervalo
  return turma.meeting_rules.flatMap(rule => {
    // rule: { weekday: 0-6 (domingo=0), time: "HH:mm", ... }
    const time = rule.time && typeof rule.time === "string" && rule.time.match(/^\d{2}:\d{2}$/) ? rule.time : (turma.meeting_time || "08:00");
    return eachDayOfInterval({ start, end })
      .filter(day => day.getDay() === rule.weekday)
      .map(day => ({
        turma_id: turma.id,
        teacher_id: turma.teacher_id,
        planned: true,
        date: day.toISOString().slice(0, 10),
        time,
        ...rule,
      }));
  });
}

import { describe, it, expect } from "vitest";
import {
  buildEventsFromRules,
  buildEventsFromSessions,
  weekdayToColIdx,
  hourToMinutes,
  localDateTimeForGridSlot,
} from "../agendaEvents";

describe("weekdayToColIdx", () => {
  it("maps Mon..Sat (1..6) to grid columns 0..5", () => {
    expect(weekdayToColIdx(1)).toBe(0);
    expect(weekdayToColIdx(6)).toBe(5);
  });

  it("returns -1 for Sunday and invalid input", () => {
    expect(weekdayToColIdx(0)).toBe(-1);
    expect(weekdayToColIdx(null)).toBe(-1);
    expect(weekdayToColIdx("abc")).toBe(-1);
  });
});

describe("hourToMinutes", () => {
  it("converts HH:MM strings to minutes from midnight", () => {
    expect(hourToMinutes("08:00")).toBe(480);
    expect(hourToMinutes("19:30")).toBe(1170);
  });

  it("returns 0 for invalid input", () => {
    expect(hourToMinutes("")).toBe(0);
    expect(hourToMinutes(null)).toBe(0);
  });
});

describe("buildEventsFromRules", () => {
  it("ignores turmas with no rules and Sunday rules", () => {
    const events = buildEventsFromRules(
      [
        { id: "a", name: "A", meeting_rules: null },
        { id: "b", name: "B", meeting_rules: [{ weekday: 0, time: "10:00", duration_hours: 1 }] },
      ],
      {}
    );
    expect(events).toHaveLength(0);
  });

  it("emits one event per rule with derived end time", () => {
    const events = buildEventsFromRules(
      [
        {
          id: "t1",
          name: "Intermediário",
          teacher_id: "p1",
          capacity: 12,
          meeting_rules: [
            { weekday: 1, time: "19:00", duration_hours: 1.5 },
            { weekday: 3, time: "08:30", duration_hours: 1 },
          ],
        },
      ],
      { p1: "Profe" }
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: "rule",
      day: 0,
      start: "19:00",
      end: "20:30",
      teacher: "Profe",
      capacity: 12,
    });
    expect(events[1]).toMatchObject({ day: 2, start: "08:30", end: "09:30" });
  });

  it("falls back to 'Sem professor' when teacher_id is missing", () => {
    const [event] = buildEventsFromRules(
      [{ id: "t1", name: "X", meeting_rules: [{ weekday: 2, time: "10:00", duration_hours: 1 }] }],
      {}
    );
    expect(event.teacher).toBe("Sem professor");
  });
});

describe("localDateTimeForGridSlot", () => {
  const monday = new Date("2026-04-27T00:00:00");

  it("offsets the week start by dayIdx and applies the time", () => {
    expect(localDateTimeForGridSlot(monday, 0, "19:00")).toBe("2026-04-27T19:00");
    expect(localDateTimeForGridSlot(monday, 3, "08:30")).toBe("2026-04-30T08:30");
    expect(localDateTimeForGridSlot(monday, 5, "10:15")).toBe("2026-05-02T10:15");
  });

  it("falls back to 08:00 when time is missing", () => {
    expect(localDateTimeForGridSlot(monday, 1, null)).toBe("2026-04-28T08:00");
  });
});

describe("buildEventsFromSessions", () => {
  const monday = new Date("2026-04-27T00:00:00");
  const turmaMap = { t1: { id: "t1", name: "A", teacher_id: "p1", capacity: 8 } };
  const teacherMap = { p1: "Profe" };

  it("places sessions on the correct day index relative to weekStart", () => {
    const sessions = [
      { id: "s1", turma_id: "t1", date: "2026-04-27T19:00:00", duration_hours: 1 }, // Monday → 0
      { id: "s2", turma_id: "t1", date: "2026-04-30T08:00:00", duration_hours: 2 }, // Thursday → 3
    ];
    const events = buildEventsFromSessions(sessions, turmaMap, teacherMap, monday);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ day: 0, start: "19:00", end: "20:00", kind: "session" });
    expect(events[1]).toMatchObject({ day: 3, start: "08:00", end: "10:00" });
  });

  it("filters sessions outside the Mon..Sat window", () => {
    const sessions = [
      { id: "before", turma_id: "t1", date: "2026-04-26T10:00:00", duration_hours: 1 }, // Sunday before
      { id: "sat", turma_id: "t1", date: "2026-05-02T10:00:00", duration_hours: 1 }, // Saturday → 5
      { id: "sun", turma_id: "t1", date: "2026-05-03T10:00:00", duration_hours: 1 }, // Sunday after
    ];
    const events = buildEventsFromSessions(sessions, turmaMap, teacherMap, monday);
    expect(events.map((e) => e.id)).toEqual(["session-sat"]);
    expect(events[0].day).toBe(5);
  });

  it("handles missing turma in map by using fallback title", () => {
    const events = buildEventsFromSessions(
      [{ id: "s1", turma_id: "missing", date: "2026-04-27T10:00:00", duration_hours: 1 }],
      {},
      {},
      monday
    );
    expect(events[0].title).toBe("Aula");
    expect(events[0].teacher).toBe("Sem professor");
  });

  it("ignores rows with null/invalid date", () => {
    const events = buildEventsFromSessions(
      [
        { id: "s1", turma_id: "t1", date: null, duration_hours: 1 },
        { id: "s2", turma_id: "t1", date: "not-a-date", duration_hours: 1 },
      ],
      turmaMap,
      teacherMap,
      monday
    );
    expect(events).toHaveLength(0);
  });
});

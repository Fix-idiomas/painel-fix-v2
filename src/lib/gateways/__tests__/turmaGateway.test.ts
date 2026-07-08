// toIsoTz interpreta "YYYY-MM-DDTHH:MM" (sem offset) como hora LOCAL do runtime.
// No navegador do usuário isso é SP; fixamos aqui para asserção determinística.
process.env.TZ = "America/Sao_Paulo";

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./supabaseMock";

const mock = createSupabaseMock();
vi.mock("@/lib/supabaseClient", () => ({ supabase: mock }));

const { turmaGateway } = await import("../turmaGateway");

beforeEach(() => {
  vi.clearAllMocks();
  mock._result = { data: null, error: null };
  mock._tableResults = {};
  mock._rpcResults = {};
  mock._calls = [];
  mock._consumed = {};
});

describe("turmaGateway.listTurmas", () => {
  it("returns turmas with normalized rules", async () => {
    mock._result = {
      data: [{ id: "1", name: "Turma A", meeting_rules: [{ weekday: 1 }] }],
      error: null,
    };
    const result = await turmaGateway.listTurmas();
    expect(result[0].meeting_rules[0]).toEqual({
      weekday: 1,
      time: null,
      duration_hours: 0.5,
    });
  });
});

describe("turmaGateway.getSession", () => {
  it("throws when id is missing", async () => {
    await expect(turmaGateway.getSession("")).rejects.toThrow("obrigatório");
  });

  it("returns null when not found", async () => {
    mock._result = { data: null, error: null };
    const result = await turmaGateway.getSession("missing");
    expect(result).toBeNull();
  });

  it("normalizes date and duration", async () => {
    mock._result = {
      data: { id: "s1", turma_id: "t1", date: "2026-04-27T19:00:00Z", duration_hours: "1.5", notes: "" },
      error: null,
    };
    const result = await turmaGateway.getSession("s1");
    expect(result?.date).toBe(new Date("2026-04-27T19:00:00Z").toISOString());
    expect(result?.duration_hours).toBe(1.5);
  });

  it("surfaces supabase errors", async () => {
    mock._result = { data: null, error: { message: "boom" } };
    await expect(turmaGateway.getSession("s1")).rejects.toThrow("boom");
  });
});

describe("turmaGateway.listSessionsInRange", () => {
  it("throws when start or end is missing", async () => {
    await expect(turmaGateway.listSessionsInRange({ start: "", end: "x" })).rejects.toThrow("obrigatórios");
    await expect(turmaGateway.listSessionsInRange({ start: "x", end: "" })).rejects.toThrow("obrigatórios");
  });

  it("returns rows with ISO dates and numeric duration", async () => {
    mock._result = {
      data: [
        { id: "s1", turma_id: "t1", date: "2026-04-27T19:00:00Z", duration_hours: "1.5" },
      ],
      error: null,
    };
    const rows = await turmaGateway.listSessionsInRange({
      start: "2026-04-27T00:00:00Z",
      end: "2026-05-04T00:00:00Z",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe(new Date("2026-04-27T19:00:00Z").toISOString());
    expect(rows[0].duration_hours).toBe(1.5);
  });

  it("surfaces supabase errors", async () => {
    mock._result = { data: null, error: { message: "boom" } };
    await expect(
      turmaGateway.listSessionsInRange({ start: "a", end: "b" })
    ).rejects.toThrow("boom");
  });
});

describe("turmaGateway.createTurma", () => {
  it("throws when name is missing", async () => {
    await expect(turmaGateway.createTurma({})).rejects.toThrow("obrigatório");
  });

  it("throws when teacher_id is missing", async () => {
    await expect(turmaGateway.createTurma({ name: "Turma B" })).rejects.toThrow("teacher_id");
  });

  it("creates turma with defaults", async () => {
    mock._result = { data: { id: "1", name: "Turma B" }, error: null };
    const result = await turmaGateway.createTurma({ name: "Turma B", teacher_id: "t-1" });
    expect(result.name).toBe("Turma B");
  });
});

describe("turmaGateway.updateTurma", () => {
  it("throws when id is missing", async () => {
    await expect(turmaGateway.updateTurma(null, {})).rejects.toThrow("obrigatório");
  });

  it("throws when name is empty", async () => {
    await expect(turmaGateway.updateTurma("1", { name: "" })).rejects.toThrow("vazio");
  });
});

describe("turmaGateway.deleteTurma", () => {
  it("throws when id is missing", async () => {
    await expect(turmaGateway.deleteTurma(null)).rejects.toThrow("obrigatório");
  });
});

describe("turmaGateway.addStudentToTurma", () => {
  it("throws when params are missing", async () => {
    await expect(turmaGateway.addStudentToTurma(null, null)).rejects.toThrow("obrigatórios");
  });
});

describe("turmaGateway.removeStudentFromTurma", () => {
  it("throws when params are missing", async () => {
    await expect(turmaGateway.removeStudentFromTurma(null, null)).rejects.toThrow("obrigatórios");
  });
});

describe("turmaGateway.listTurmaMembers", () => {
  it("throws when turmaId is missing", async () => {
    await expect(turmaGateway.listTurmaMembers(null)).rejects.toThrow("obrigatório");
  });

  it("returns empty array when no members", async () => {
    mock._result = { data: [], error: null };
    const result = await turmaGateway.listTurmaMembers("1");
    expect(result).toEqual([]);
  });
});

describe("turmaGateway.createSession", () => {
  it("throws when turma_id is missing", async () => {
    await expect(turmaGateway.createSession({})).rejects.toThrow("turma_id");
  });

  it("throws when date is missing", async () => {
    await expect(turmaGateway.createSession({ turma_id: "1" })).rejects.toThrow("date");
  });

  it("creates session successfully", async () => {
    mock._result = { data: { id: "s1", turma_id: "1" }, error: null };
    const result = await turmaGateway.createSession({
      turma_id: "1",
      date: "2024-03-15",
    });
    expect(result.turma_id).toBe("1");
  });
});

describe("turmaGateway.deleteSession", () => {
  it("throws when id is missing", async () => {
    await expect(turmaGateway.deleteSession(null)).rejects.toThrow("obrigatório");
  });
});

describe("turmaGateway.listSessionsWithAttendance", () => {
  it("throws when turmaId is missing", async () => {
    await expect(
      turmaGateway.listSessionsWithAttendance({ turmaId: null, start: "2024-01-01", end: "2024-01-31" })
    ).rejects.toThrow("obrigatório");
  });

  it("throws when start/end are missing", async () => {
    await expect(
      turmaGateway.listSessionsWithAttendance({ turmaId: "1" })
    ).rejects.toThrow("obrigatórios");
  });
});

describe("turmaGateway.ensureSessionsFromRules", () => {
  it("throws when turmaId is missing", async () => {
    await expect(
      turmaGateway.ensureSessionsFromRules({ turmaId: null, startDate: "2024-01-01", endDate: "2024-01-31" })
    ).rejects.toThrow("obrigatório");
  });

  it("throws on invalid interval", async () => {
    await expect(
      turmaGateway.ensureSessionsFromRules({ turmaId: "1", startDate: "2024-02-01", endDate: "2024-01-01" })
    ).rejects.toThrow("inválido");
  });

  it("returns 0 when the turma has no meeting rules", async () => {
    mock._tableResults.turmas = { data: { id: "t1", meeting_rules: [] }, error: null };
    const n = await turmaGateway.ensureSessionsFromRules({
      turmaId: "t1",
      startDate: "2026-07-06",
      endDate: "2026-07-08",
    });
    expect(n).toBe(0);
    // sem regra → não faz upsert
    expect(mock._calls.some((c) => c.table === "sessions" && c.method === "upsert")).toBe(false);
  });

  it("cria a sessão com o HORÁRIO da regra (não meia-noite)", async () => {
    // Regra: terça (weekday 2) às 19:30. O intervalo 06→08/07/2026 contém a terça 07/07.
    mock._tableResults.turmas = {
      data: { id: "t1", meeting_rules: [{ weekday: 2, time: "19:30", duration_hours: 1 }] },
      error: null,
    };
    const n = await turmaGateway.ensureSessionsFromRules({
      turmaId: "t1",
      startDate: "2026-07-06",
      endDate: "2026-07-08",
    });
    expect(n).toBe(1);

    const upsert = mock._calls.find((c) => c.table === "sessions" && c.method === "upsert");
    expect(upsert).toBeTruthy();
    const rows = upsert!.args[0] as Array<{ date: string; turma_id: string }>;
    expect(rows).toHaveLength(1);
    // SP 19:30 = UTC 22:30 (UTC-3, sem horário de verão). Nunca 00:00.
    expect(rows[0].date).toBe("2026-07-07T22:30:00.000Z");
    expect(rows[0].turma_id).toBe("t1");
  });
});

describe("turmaGateway.listSessions (agregação de chamada)", () => {
  it("throws when turmaId is missing", async () => {
    await expect(turmaGateway.listSessions("")).rejects.toThrow("obrigatório");
  });

  it("filtra por turma_id e agrega has_attendance/attendance_count/present_count", async () => {
    mock._tableResults.sessions = {
      data: [
        { id: "s1", turma_id: "t1", date: "2026-07-07T22:30:00Z" },
        { id: "s2", turma_id: "t1", date: "2026-07-08T22:30:00Z" },
        { id: "s3", turma_id: "t1", date: "2026-07-09T22:30:00Z" },
      ],
      error: null,
    };
    mock._tableResults.attendance = {
      // s1: 2 chamadas, 1 presente. s2: 1 chamada, 0 presente (todos ausentes). s3: nenhuma.
      data: [
        { session_id: "s1", present: true },
        { session_id: "s1", present: false },
        { session_id: "s2", present: false },
      ],
      error: null,
    };

    const rows = await turmaGateway.listSessions("t1");

    // escopo por turma foi aplicado
    expect(mock._calls.some((c) => c.table === "sessions" && c.method === "eq" && c.args[0] === "turma_id" && c.args[1] === "t1")).toBe(true);

    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.s1).toMatchObject({ has_attendance: true, attendance_count: 2, present_count: 1 });
    expect(byId.s2).toMatchObject({ has_attendance: true, attendance_count: 1, present_count: 0 });
    expect(byId.s3).toMatchObject({ has_attendance: false, attendance_count: 0, present_count: 0 });
  });

  it("não consulta attendance quando não há sessões", async () => {
    mock._tableResults.sessions = { data: [], error: null };
    const rows = await turmaGateway.listSessions("t1");
    expect(rows).toEqual([]);
    expect(mock._calls.some((c) => c.table === "attendance")).toBe(false);
  });
});

describe("turmaGateway.listSessionsInRange (agregação de chamada)", () => {
  it("agrega present_count por sessão", async () => {
    mock._tableResults.sessions = {
      data: [{ id: "s1", turma_id: "t1", date: "2026-07-07T22:30:00Z", duration_hours: "1" }],
      error: null,
    };
    mock._tableResults.attendance = {
      data: [
        { session_id: "s1", present: true },
        { session_id: "s1", present: true },
        { session_id: "s1", present: false },
      ],
      error: null,
    };
    const rows = await turmaGateway.listSessionsInRange({
      start: "2026-07-01T00:00:00Z",
      end: "2026-08-01T00:00:00Z",
    });
    expect(rows[0]).toMatchObject({
      has_attendance: true,
      attendance_count: 3,
      present_count: 2,
      duration_hours: 1,
    });
  });
});

describe("turmaGateway.listSessionsWithAttendance (sucesso)", () => {
  it("escopa por turma e marca has_attendance por sessão", async () => {
    mock._tableResults.sessions = {
      data: [
        { id: "s1", turma_id: "t1", date: "2026-07-07T22:30:00Z", duration_hours: "1", notes: "" },
        { id: "s2", turma_id: "t1", date: "2026-07-08T22:30:00Z", duration_hours: "1", notes: "" },
      ],
      error: null,
    };
    // só s1 tem chamada
    mock._tableResults.attendance = { data: [{ session_id: "s1" }], error: null };

    const rows = await turmaGateway.listSessionsWithAttendance({
      turmaId: "t1",
      start: "2026-07-01",
      end: "2026-07-31",
    });

    expect(mock._calls.some((c) => c.table === "sessions" && c.method === "eq" && c.args[0] === "turma_id" && c.args[1] === "t1")).toBe(true);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.s1.has_attendance).toBe(true);
    expect(byId.s2.has_attendance).toBe(false);
  });

  it("retorna [] sem consultar attendance quando não há sessões", async () => {
    mock._tableResults.sessions = { data: [], error: null };
    const rows = await turmaGateway.listSessionsWithAttendance({
      turmaId: "t1",
      start: "2026-07-01",
      end: "2026-07-31",
    });
    expect(rows).toEqual([]);
    expect(mock._calls.some((c) => c.table === "attendance")).toBe(false);
  });
});

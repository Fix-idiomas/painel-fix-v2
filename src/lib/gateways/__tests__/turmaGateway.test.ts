import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./supabaseMock";

const mock = createSupabaseMock();
vi.mock("@/lib/supabaseClient", () => ({ supabase: mock }));

const { turmaGateway } = await import("../turmaGateway");

beforeEach(() => {
  vi.clearAllMocks();
  mock._result = { data: null, error: null };
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
});

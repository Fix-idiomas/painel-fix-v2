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

describe("turmaGateway.createTurma", () => {
  it("throws when name is missing", async () => {
    await expect(turmaGateway.createTurma({})).rejects.toThrow("obrigatório");
  });

  it("creates turma with defaults", async () => {
    mock._result = { data: { id: "1", name: "Turma B" }, error: null };
    const result = await turmaGateway.createTurma({ name: "Turma B" });
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

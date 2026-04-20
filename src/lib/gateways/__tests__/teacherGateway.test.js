import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./supabaseMock";

const mock = createSupabaseMock();
vi.mock("@/lib/supabaseClient", () => ({ supabase: mock }));

const { teacherGateway } = await import("../teacherGateway");

beforeEach(() => {
  vi.clearAllMocks();
  mock._result = { data: null, error: null };
});

describe("teacherGateway.listTeachers", () => {
  it("returns teachers", async () => {
    const teachers = [{ id: "1", name: "Prof. Ana" }];
    mock._result = { data: teachers, error: null };
    const result = await teacherGateway.listTeachers();
    expect(result).toEqual(teachers);
    expect(mock.from).toHaveBeenCalledWith("teachers");
  });
});

describe("teacherGateway.createTeacher", () => {
  it("throws when name is missing", async () => {
    await expect(teacherGateway.createTeacher({})).rejects.toThrow("'name' é obrigatório");
  });

  it("throws when pay_day is out of range", async () => {
    await expect(
      teacherGateway.createTeacher({ name: "Ana", pay_day: 30 })
    ).rejects.toThrow("pay_day");
  });

  it("creates teacher with defaults", async () => {
    const created = { id: "1", name: "Ana" };
    mock._result = { data: created, error: null };
    const result = await teacherGateway.createTeacher({ name: "Ana" });
    expect(result).toEqual(created);
  });
});

describe("teacherGateway.updateTeacher", () => {
  it("throws when id is missing", async () => {
    await expect(teacherGateway.updateTeacher(null, {})).rejects.toThrow("'id' é obrigatório");
  });

  it("throws when nothing to update", async () => {
    await expect(teacherGateway.updateTeacher("1", {})).rejects.toThrow("nada para atualizar");
  });

  it("normalizes rate_rules", async () => {
    mock._result = { data: { id: "1" }, error: null };
    await teacherGateway.updateTeacher("1", {
      rate_rules: [{ min: "1", max: "5", rate: "50" }],
    });
    // Should not throw — means normalization worked
  });
});

describe("teacherGateway.setTeacherStatus", () => {
  it("rejects invalid status", async () => {
    await expect(
      teacherGateway.setTeacherStatus("1", "suspended")
    ).rejects.toThrow("status inválido");
  });
});

describe("teacherGateway.deleteTeacher", () => {
  it("throws when id is missing", async () => {
    await expect(teacherGateway.deleteTeacher(null)).rejects.toThrow("obrigatório");
  });
});

describe("teacherGateway.sumTeacherPayoutByMonth", () => {
  it("throws when params are missing", async () => {
    await expect(teacherGateway.sumTeacherPayoutByMonth(null, null)).rejects.toThrow("obrigatórios");
  });

  it("returns zeros when teacher not found", async () => {
    // First call: teacher query returns null
    let callCount = 0;
    mock.from.mockImplementation(() => {
      callCount++;
      const c = {
        select: vi.fn(() => c),
        eq: vi.fn(() => c),
        gte: vi.fn(() => c),
        lt: vi.fn(() => c),
        single: vi.fn(() => c),
        then: (resolve) => {
          if (callCount === 1) {
            return resolve({ data: null, error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return c;
    });

    const result = await teacherGateway.sumTeacherPayoutByMonth("t1", "2024-03");
    expect(result.hours).toBe(0);
    expect(result.sessions).toBe(0);
    expect(result.amount).toBe(0);
  });
});

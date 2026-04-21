import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./supabaseMock";

const mock = createSupabaseMock();
vi.mock("@/lib/supabaseClient", () => ({ supabase: mock }));

const { studentGateway } = await import("../studentGateway");

// Preserve the factory-installed chainable so tests that override
// mock.from with custom implementations can be restored afterwards.
const defaultFromImpl = mock.from.getMockImplementation();

beforeEach(() => {
  vi.clearAllMocks();
  mock.from.mockImplementation(defaultFromImpl);
  mock._result = { data: null, error: null };
  mock._rpcResults = {};
});

describe("studentGateway.listStudents", () => {
  it("returns students from supabase", async () => {
    const students = [{ id: "1", name: "João", status: "ativo" }];
    mock._result = { data: students, error: null };

    const result = await studentGateway.listStudents();
    expect(result).toEqual(students);
    expect(mock.from).toHaveBeenCalledWith("students");
  });

  it("falls back without photo_url when column missing", async () => {
    // First call fails with photo_url error
    let callCount = 0;
    mock.from();
    mock.from.mockImplementation(() => {
      callCount++;
      const c: Record<string, unknown> = {
        select: vi.fn(() => c),
        order: vi.fn(() => c),
        then: (resolve: (r: { data: unknown; error: unknown }) => unknown) => {
          if (callCount === 1) {
            return resolve({ data: null, error: { message: "column photo_url does not exist" } });
          }
          return resolve({ data: [{ id: "1", name: "João" }], error: null });
        },
      };
      return c;
    });

    const result = await studentGateway.listStudents();
    expect(result).toEqual([{ id: "1", name: "João", photo_url: null }]);
  });
});

describe("studentGateway.createStudent", () => {
  it("throws when name is missing", async () => {
    await expect(studentGateway.createStudent({} as never)).rejects.toThrow("Nome é obrigatório");
  });

  it("creates a student successfully", async () => {
    const created = { id: "1", name: "Maria" };
    mock._rpcResults.current_tenant_id = { data: "tenant-1", error: null };
    mock._result = { data: created, error: null };

    const result = await studentGateway.createStudent({
      name: "Maria",
      monthly_value: 500,
      due_day: 10,
    });
    expect(result).toEqual(created);
  });
});

describe("studentGateway.updateStudent", () => {
  it("throws when id is missing", async () => {
    await expect(studentGateway.updateStudent(null, {})).rejects.toThrow("'id' é obrigatório");
  });

  it("throws when nothing to update", async () => {
    await expect(studentGateway.updateStudent("1", {})).rejects.toThrow("nada para atualizar");
  });

  it("throws friendly message on foreign key error", async () => {
    mock._result = { data: null, error: { message: "violates foreign key constraint" } };

    await expect(
      studentGateway.updateStudent("1", { payer_id: "invalid" })
    ).rejects.toThrow("Pagador inválido");
  });

  it("validates due_day range", async () => {
    await expect(
      studentGateway.updateStudent("1", { due_day: 30 })
    ).rejects.toThrow("due_day");
  });
});

describe("studentGateway.setStudentStatus", () => {
  it("rejects invalid status", async () => {
    await expect(
      studentGateway.setStudentStatus("1", "foo" as never)
    ).rejects.toThrow("status inválido");
  });

  it("accepts valid status", async () => {
    mock._result = { data: { id: "1", status: "inativo" }, error: null };
    const result = await studentGateway.setStudentStatus("1", "inativo");
    expect(result.status).toBe("inativo");
  });
});

describe("studentGateway.deleteStudent", () => {
  it("throws when id is missing", async () => {
    await expect(studentGateway.deleteStudent(null)).rejects.toThrow("ID é obrigatório");
  });

  it("returns true on success", async () => {
    mock._result = { data: null, error: null };
    const result = await studentGateway.deleteStudent("1");
    expect(result).toBe(true);
  });
});

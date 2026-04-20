import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./supabaseMock";

const mock = createSupabaseMock();
vi.mock("@/lib/supabaseClient", () => ({ supabase: mock }));

const { payerGateway } = await import("../payerGateway");

beforeEach(() => {
  vi.clearAllMocks();
  mock._result = { data: null, error: null };
});

describe("payerGateway.listPayers", () => {
  it("returns payers", async () => {
    const payers = [{ id: "1", name: "Pagador A" }];
    mock._result = { data: payers, error: null };
    const result = await payerGateway.listPayers();
    expect(result).toEqual(payers);
    expect(mock.from).toHaveBeenCalledWith("payers");
  });
});

describe("payerGateway.createPayer", () => {
  it("throws when name is missing", async () => {
    await expect(payerGateway.createPayer({ name: "" })).rejects.toThrow("obrigatório");
  });

  it("creates payer", async () => {
    mock._result = { data: { id: "1", name: "Ana" }, error: null };
    const result = await payerGateway.createPayer({ name: "Ana" });
    expect(result.name).toBe("Ana");
  });
});

describe("payerGateway.updatePayer", () => {
  it("throws when id is missing", async () => {
    await expect(payerGateway.updatePayer(null, {})).rejects.toThrow("obrigatório");
  });

  it("throws when name becomes empty", async () => {
    await expect(payerGateway.updatePayer("1", { name: "" })).rejects.toThrow("obrigatório");
  });
});

describe("payerGateway.deletePayer", () => {
  it("throws when id is missing", async () => {
    await expect(payerGateway.deletePayer(null)).rejects.toThrow("obrigatório");
  });

  it("throws friendly message on FK violation", async () => {
    mock._result = { data: null, error: { message: "violates foreign key constraint" } };
    await expect(payerGateway.deletePayer("1")).rejects.toThrow("pagador em uso");
  });

  it("returns success on delete", async () => {
    mock._result = { data: null, error: null };
    const result = await payerGateway.deletePayer("1");
    expect(result).toEqual({ success: true });
  });
});

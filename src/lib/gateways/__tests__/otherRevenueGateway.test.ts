import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./supabaseMock";

const mock = createSupabaseMock();
vi.mock("@/lib/supabaseClient", () => ({ supabase: mock }));

const { otherRevenueGateway } = await import("../otherRevenueGateway");

beforeEach(() => {
  vi.clearAllMocks();
  mock._result = { data: null, error: null };
  mock._rpcResults = {};
});

describe("otherRevenueGateway.createOtherRevenueTemplate", () => {
  it("throws when title is missing", async () => {
    await expect(
      otherRevenueGateway.createOtherRevenueTemplate({})
    ).rejects.toThrow("obrigatório");
  });

  it("creates template successfully", async () => {
    mock._rpcResults.current_tenant_id = { data: "t1", error: null };
    mock._result = { data: { id: "tpl1", title: "Aluguel" }, error: null };
    const result = await otherRevenueGateway.createOtherRevenueTemplate({
      title: "Aluguel",
      amount: 1000,
    });
    expect(result.title).toBe("Aluguel");
  });
});

describe("otherRevenueGateway.ensureOtherRevenuesForMonth", () => {
  it("throws when ym is invalid", async () => {
    await expect(
      otherRevenueGateway.ensureOtherRevenuesForMonth("")
    ).rejects.toThrow("YYYY-MM");
  });
});

describe("otherRevenueGateway.createOtherRevenue", () => {
  it("throws when title is missing", async () => {
    await expect(
      otherRevenueGateway.createOtherRevenue({ ym: "2024-03", amount: 100 })
    ).rejects.toThrow("obrigatório");
  });

  it("creates revenue successfully", async () => {
    mock._result = { data: { id: "or1", title: "Venda" }, error: null };
    const result = await otherRevenueGateway.createOtherRevenue({
      ym: "2024-03",
      title: "Venda",
      amount: 500,
    });
    expect(result.title).toBe("Venda");
  });
});

describe("otherRevenueGateway.markOtherRevenuePaid", () => {
  it("throws when id is missing", async () => {
    await expect(otherRevenueGateway.markOtherRevenuePaid(null)).rejects.toThrow("obrigatório");
  });

  it("returns true on success", async () => {
    mock._result = { data: null, error: null };
    const result = await otherRevenueGateway.markOtherRevenuePaid("1");
    expect(result).toBe(true);
  });
});

describe("otherRevenueGateway.cancelOtherRevenue", () => {
  it("throws when id is missing", async () => {
    await expect(otherRevenueGateway.cancelOtherRevenue(null)).rejects.toThrow("obrigatório");
  });
});

describe("otherRevenueGateway.reopenOtherRevenue", () => {
  it("throws when id is missing", async () => {
    await expect(otherRevenueGateway.reopenOtherRevenue(null)).rejects.toThrow("obrigatório");
  });
});

describe("otherRevenueGateway.deleteOtherRevenue", () => {
  it("throws when id is missing", async () => {
    await expect(otherRevenueGateway.deleteOtherRevenue(null)).rejects.toThrow("obrigatório");
  });
});

describe("otherRevenueGateway.updateOtherRevenue", () => {
  it("throws when id is missing", async () => {
    await expect(otherRevenueGateway.updateOtherRevenue(null)).rejects.toThrow("obrigatório");
  });

  it("throws when nothing to update", async () => {
    await expect(otherRevenueGateway.updateOtherRevenue("1", {})).rejects.toThrow("nada para atualizar");
  });

  it("validates due_date format", async () => {
    await expect(
      otherRevenueGateway.updateOtherRevenue("1", { due_date: "invalid" })
    ).rejects.toThrow("YYYY-MM-DD");
  });

  it("validates amount > 0", async () => {
    await expect(
      otherRevenueGateway.updateOtherRevenue("1", { amount: -10 })
    ).rejects.toThrow("amount");
  });
});

describe("otherRevenueGateway.cancelOtherRevenueSeriesFrom", () => {
  it("throws when id is missing", async () => {
    await expect(
      otherRevenueGateway.cancelOtherRevenueSeriesFrom(null)
    ).rejects.toThrow("obrigatório");
  });
});

describe("otherRevenueGateway.deleteOtherRevenueSeriesFrom", () => {
  it("throws when id is missing", async () => {
    await expect(
      otherRevenueGateway.deleteOtherRevenueSeriesFrom(null)
    ).rejects.toThrow("obrigatório");
  });
});

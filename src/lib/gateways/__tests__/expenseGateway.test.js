import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock } from "./supabaseMock";

const mock = createSupabaseMock();
vi.mock("@/lib/supabaseClient", () => ({ supabase: mock }));

const { expenseGateway } = await import("../expenseGateway");

beforeEach(() => {
  vi.clearAllMocks();
  mock._result = { data: null, error: null };
});

describe("expenseGateway.createExpenseTemplate", () => {
  it("throws when title is missing", async () => {
    await expect(expenseGateway.createExpenseTemplate({ title: "" })).rejects.toThrow("obrigatório");
  });

  it("validates installments mode requires installments count", async () => {
    await expect(
      expenseGateway.createExpenseTemplate({
        title: "Test",
        recurrence_mode: "installments",
        installments: null,
      })
    ).rejects.toThrow("'installments' é obrigatório");
  });

  it("validates until_month mode requires end_month", async () => {
    await expect(
      expenseGateway.createExpenseTemplate({
        title: "Test",
        recurrence_mode: "until_month",
        end_month: null,
      })
    ).rejects.toThrow("'end_month' é obrigatório");
  });

  it("validates indefinite mode rejects installments/end_month", async () => {
    await expect(
      expenseGateway.createExpenseTemplate({
        title: "Test",
        recurrence_mode: "indefinite",
        installments: 3,
      })
    ).rejects.toThrow("nulos");
  });
});

describe("expenseGateway.createExpenseEntry", () => {
  it("throws when due_date is missing", async () => {
    await expect(
      expenseGateway.createExpenseEntry({ amount: 100, description: "Test" })
    ).rejects.toThrow("due_date");
  });

  it("throws when description is missing", async () => {
    await expect(
      expenseGateway.createExpenseEntry({ due_date: "2024-03-15", amount: 100 })
    ).rejects.toThrow("description");
  });

  it("throws when amount is zero", async () => {
    await expect(
      expenseGateway.createExpenseEntry({ due_date: "2024-03-15", amount: 0, description: "Test" })
    ).rejects.toThrow("amount");
  });

  it("creates entry successfully", async () => {
    mock._result = { data: { id: "e1" }, error: null };
    const result = await expenseGateway.createExpenseEntry({
      due_date: "2024-03-15",
      amount: 100,
      description: "Teste",
    });
    expect(result.id).toBe("e1");
  });
});

describe("expenseGateway.createOneOffExpense", () => {
  it("delegates to createExpenseEntry", async () => {
    mock._result = { data: { id: "e1" }, error: null };
    const result = await expenseGateway.createOneOffExpense({
      date: "2024-03-15",
      amount: 100,
      title: "Teste",
    });
    expect(result.id).toBe("e1");
  });
});

describe("expenseGateway.markExpensePaid", () => {
  it("throws when id is missing", async () => {
    await expect(expenseGateway.markExpensePaid(null)).rejects.toThrow("obrigatório");
  });
});

describe("expenseGateway.cancelExpense", () => {
  it("throws when id is missing", async () => {
    await expect(expenseGateway.cancelExpense(null)).rejects.toThrow("obrigatório");
  });
});

describe("expenseGateway.reopenExpense", () => {
  it("throws when id is missing", async () => {
    await expect(expenseGateway.reopenExpense(null)).rejects.toThrow("obrigatório");
  });
});

describe("expenseGateway.updateExpenseTemplate", () => {
  it("throws when id is missing", async () => {
    await expect(expenseGateway.updateExpenseTemplate(null, {})).rejects.toThrow("obrigatório");
  });

  it("throws when title becomes empty", async () => {
    await expect(
      expenseGateway.updateExpenseTemplate("1", { title: "" })
    ).rejects.toThrow("vazio");
  });
});

describe("expenseGateway.deleteExpenseTemplate", () => {
  it("throws when id is missing", async () => {
    await expect(expenseGateway.deleteExpenseTemplate(null)).rejects.toThrow("obrigatório");
  });
});

describe("expenseGateway.listExpenseEntries", () => {
  it("calculates days_overdue", async () => {
    mock._result = {
      data: [{ id: "1", status: "pending", due_date: "2020-01-01", amount: 100 }],
      error: null,
    };
    const result = await expenseGateway.listExpenseEntries({ ym: "2020-01" });
    expect(result.rows[0].days_overdue).toBeGreaterThan(0);
    expect(result.kpis.overdue).toBe(100);
  });
});

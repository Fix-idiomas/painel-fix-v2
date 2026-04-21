import { describe, it, expect, vi } from "vitest";
import { createSupabaseMock } from "./supabaseMock";

const mock = createSupabaseMock();
vi.mock("@/lib/supabaseClient", () => ({ supabase: mock }));

const {
  mapErr,
  normalizeRules,
  monthStartOf,
  clampDay1to28,
  dueDateFor,
  monthsBetween,
  isRecurrenceActiveForMonth,
  toIsoTz,
  normalizeDate,
  addDaysISO,
  tzToday,
} = await import("../helpers");

// --- mapErr ---
describe("mapErr", () => {
  it("throws with the error message", () => {
    expect(() => mapErr("ctx", { message: "boom" })).toThrow("boom");
  });

  it("throws friendly message for teacher_id_snapshot NOT NULL", () => {
    const err = {
      code: "23502",
      message: "null value in column teacher_id_snapshot",
      details: "",
    };
    expect(() => mapErr("ctx", err)).toThrow("professor");
  });

  it("falls back to generic message when error has no message", () => {
    expect(() => mapErr("myCtx", {})).toThrow("Erro em myCtx");
  });
});

// --- normalizeRules ---
describe("normalizeRules", () => {
  it("returns empty array for non-array input", () => {
    expect(normalizeRules(null)).toEqual([]);
    expect(normalizeRules("foo")).toEqual([]);
  });

  it("normalizes rules with defaults", () => {
    const rules = [{ weekday: 1, time: "08:00" }];
    const result = normalizeRules(rules);
    expect(result).toEqual([
      { weekday: 1, time: "08:00", duration_hours: 0.5 },
    ]);
  });

  it("preserves weekday 0 (Sunday)", () => {
    const result = normalizeRules([{ weekday: 0 }]);
    expect(result[0].weekday).toBe(0);
  });
});

// --- monthStartOf ---
describe("monthStartOf", () => {
  it("converts YYYY-MM to first day", () => {
    expect(monthStartOf("2024-03")).toBe("2024-03-01");
  });

  it("converts YYYY-MM-DD to first day", () => {
    expect(monthStartOf("2024-03-15")).toBe("2024-03-01");
  });

  it("returns current month for invalid input", () => {
    const result = monthStartOf(null);
    expect(result).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

// --- clampDay1to28 ---
describe("clampDay1to28", () => {
  it("treats 0 as missing and defaults to 5", () => {
    // Implementation uses `n || 5`, so 0 is treated as falsy/missing.
    expect(clampDay1to28(0)).toBe(5);
  });

  it("clamps negative values to 1", () => {
    expect(clampDay1to28(-5)).toBe(1);
  });

  it("clamps above 28 to 28", () => {
    expect(clampDay1to28(31)).toBe(28);
  });

  it("defaults null to 5", () => {
    expect(clampDay1to28(null)).toBe(5);
  });

  it("passes through valid values", () => {
    expect(clampDay1to28(15)).toBe(15);
  });
});

// --- dueDateFor ---
describe("dueDateFor", () => {
  it("builds a due date from ym and day", () => {
    expect(dueDateFor("2024-03", 10)).toBe("2024-03-10");
  });

  it("clamps day to 28", () => {
    expect(dueDateFor("2024-02", 31)).toBe("2024-02-28");
  });
});

// --- monthsBetween ---
describe("monthsBetween", () => {
  it("returns 0 for same month", () => {
    expect(monthsBetween("2024-03-01", "2024-03-01")).toBe(0);
  });

  it("returns positive for later month", () => {
    expect(monthsBetween("2024-01-01", "2024-06-01")).toBe(5);
  });

  it("returns negative for earlier month", () => {
    expect(monthsBetween("2024-06-01", "2024-01-01")).toBe(-5);
  });

  it("handles year boundary", () => {
    expect(monthsBetween("2023-11-01", "2024-02-01")).toBe(3);
  });

  it("returns null for null input", () => {
    expect(monthsBetween(null, "2024-01-01")).toBeNull();
  });
});

// --- isRecurrenceActiveForMonth ---
describe("isRecurrenceActiveForMonth", () => {
  it("returns true for indefinite mode", () => {
    const t = { recurrence_mode: "indefinite" };
    expect(isRecurrenceActiveForMonth(t, "2024-06-01")).toBe(true);
  });

  it("returns false before start_month", () => {
    const t = { recurrence_mode: "indefinite", start_month: "2024-06-01" };
    expect(isRecurrenceActiveForMonth(t, "2024-05-01")).toBe(false);
  });

  it("respects installments limit", () => {
    const t = {
      recurrence_mode: "installments",
      start_month: "2024-01-01",
      installments: 3,
    };
    expect(isRecurrenceActiveForMonth(t, "2024-01-01")).toBe(true);  // 0
    expect(isRecurrenceActiveForMonth(t, "2024-02-01")).toBe(true);  // 1
    expect(isRecurrenceActiveForMonth(t, "2024-03-01")).toBe(true);  // 2
    expect(isRecurrenceActiveForMonth(t, "2024-04-01")).toBe(false); // 3 >= 3
  });

  it("respects until_month", () => {
    const t = {
      recurrence_mode: "until_month",
      end_month: "2024-06-01",
    };
    expect(isRecurrenceActiveForMonth(t, "2024-06-01")).toBe(true);
    expect(isRecurrenceActiveForMonth(t, "2024-07-01")).toBe(false);
  });
});

// --- toIsoTz ---
describe("toIsoTz", () => {
  it("returns null for falsy input", () => {
    expect(toIsoTz(null)).toBeNull();
    expect(toIsoTz("")).toBeNull();
  });

  it("converts date-only string to ISO", () => {
    const result = toIsoTz("2024-03-15");
    expect(result).toMatch(/2024-03-15/);
    expect(result).toMatch(/T.*Z$/);
  });

  it("converts datetime string to ISO", () => {
    const result = toIsoTz("2024-03-15T10:30:00Z");
    expect(result).toMatch(/2024-03-15/);
  });
});

// --- normalizeDate ---
describe("normalizeDate", () => {
  it("converts DD/MM/YYYY to YYYY-MM-DD", () => {
    expect(normalizeDate("15/03/2024")).toBe("2024-03-15");
  });

  it("converts DD.MM.YYYY to YYYY-MM-DD", () => {
    expect(normalizeDate("15.03.2024")).toBe("2024-03-15");
  });

  it("returns ISO date as-is", () => {
    expect(normalizeDate("2024-03-15")).toBe("2024-03-15");
  });

  it("returns null for null input", () => {
    expect(normalizeDate(null)).toBeNull();
  });
});

// --- addDaysISO ---
describe("addDaysISO", () => {
  it("adds days to a date", () => {
    expect(addDaysISO("2024-03-15", 5)).toBe("2024-03-20");
  });

  it("handles month boundary", () => {
    expect(addDaysISO("2024-01-30", 3)).toBe("2024-02-02");
  });

  it("defaults to 0 days", () => {
    expect(addDaysISO("2024-03-15")).toBe("2024-03-15");
  });
});

// --- tzToday ---
describe("tzToday", () => {
  it("returns YYYY-MM-DD format", () => {
    const result = tzToday("America/Sao_Paulo");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

import { describe, it, expect } from "vitest";
import { todaySP, currentMonthSP } from "../tz";

describe("todaySP / currentMonthSP (M1)", () => {
  it("às 22h de Brasília ainda é o mesmo dia (em UTC já seria o seguinte)", () => {
    const at = "2026-11-20T01:00:00Z"; // 19/11 22:00 em SP
    expect(new Date(at).toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(todaySP(at)).toBe("2026-11-19");
  });
  it("último dia do mês à noite não pula o mês", () => {
    const at = "2026-12-01T02:30:00Z"; // 30/11 23:30 em SP
    expect(currentMonthSP(at)).toBe("2026-11");
  });
  it("de manhã coincide com UTC", () => {
    expect(todaySP("2026-11-19T12:00:00Z")).toBe("2026-11-19");
  });
});

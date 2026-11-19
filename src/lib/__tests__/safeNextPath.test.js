import { describe, it, expect } from "vitest";
import { safeNextPath } from "../safeNextPath";

describe("safeNextPath", () => {
  it("aceita caminhos internos", () => {
    expect(safeNextPath("/alunos")).toBe("/alunos");
    expect(safeNextPath("/financeiro/mensalidades?ym=2026-11")).toBe("/financeiro/mensalidades?ym=2026-11");
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["alunos"],
    ["https://evil.com"],
    ["//evil.com"],
    ["/\\evil.com"],
    ["/ok\\..\\evil"],
    ["javascript:alert(1)"],
    ["/\u0000x"],
  ])("rejeita %j → fallback", (v) => {
    expect(safeNextPath(v)).toBe("/recepcao");
  });

  it("usa o fallback informado", () => {
    expect(safeNextPath("//x", "/painel")).toBe("/painel");
  });
});

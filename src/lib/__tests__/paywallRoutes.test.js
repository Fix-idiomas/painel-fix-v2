import { describe, it, expect } from "vitest";
import { isAllowed } from "../paywallRoutes";

describe("isAllowed (allowlist do paywall)", () => {
  it("libera as rotas exatas da allowlist", () => {
    expect(isAllowed("/assinatura")).toBe(true);
    expect(isAllowed("/conta")).toBe(true);
  });

  it("libera subrotas dos itens da allowlist", () => {
    expect(isAllowed("/conta/")).toBe(true);
    expect(isAllowed("/conta/seguranca")).toBe(true);
    expect(isAllowed("/assinatura/checkout")).toBe(true);
  });

  it("NÃO casa prefixos espúrios (evita liberar rota parecida)", () => {
    expect(isAllowed("/contabilidade")).toBe(false);
    expect(isAllowed("/assinaturas")).toBe(false);
    expect(isAllowed("/conta-x")).toBe(false);
  });

  it("bloqueia rotas fora da allowlist", () => {
    expect(isAllowed("/")).toBe(false);
    expect(isAllowed("/recepcao")).toBe(false);
    expect(isAllowed("/financeiro")).toBe(false);
  });

  it("é defensivo com entradas inválidas", () => {
    expect(isAllowed("")).toBe(false);
    expect(isAllowed(null)).toBe(false);
    expect(isAllowed(undefined)).toBe(false);
  });
});

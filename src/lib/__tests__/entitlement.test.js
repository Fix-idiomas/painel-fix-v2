import { describe, it, expect } from "vitest";
import { hasEntitlement } from "../entitlement";

// "agora" fixo para tornar os testes de trial determinísticos.
const NOW = Date.parse("2026-06-25T00:00:00Z");
const future = "2026-07-08T00:00:00Z"; // depois de NOW
const past = "2026-06-20T00:00:00Z";   // antes de NOW

describe("hasEntitlement", () => {
  it("bloqueia quando não há assinatura (claim nulo)", () => {
    expect(hasEntitlement(null, NOW)).toBe(false);
    expect(hasEntitlement(undefined, NOW)).toBe(false);
  });

  it("libera assinatura ativa", () => {
    expect(hasEntitlement({ status: "active" }, NOW)).toBe(true);
  });

  it("libera trial dentro do prazo", () => {
    expect(hasEntitlement({ status: "trial", trial_end: future }, NOW)).toBe(true);
  });

  it("bloqueia trial vencido", () => {
    expect(hasEntitlement({ status: "trial", trial_end: past }, NOW)).toBe(false);
  });

  it("libera trial sem data de fim (defensivo)", () => {
    expect(hasEntitlement({ status: "trial", trial_end: null }, NOW)).toBe(true);
    expect(hasEntitlement({ status: "trial" }, NOW)).toBe(true);
  });

  it("bloqueia past_due / expired / canceled", () => {
    expect(hasEntitlement({ status: "past_due" }, NOW)).toBe(false);
    expect(hasEntitlement({ status: "expired" }, NOW)).toBe(false);
    expect(hasEntitlement({ status: "canceled" }, NOW)).toBe(false);
  });

  it("isenção vitalícia (billing_exempt) sobrepõe qualquer status", () => {
    expect(hasEntitlement({ billing_exempt: true, status: "expired" }, NOW)).toBe(true);
    expect(hasEntitlement({ billing_exempt: true, status: "canceled" }, NOW)).toBe(true);
    expect(hasEntitlement({ billing_exempt: true, status: "trial", trial_end: past }, NOW)).toBe(true);
  });

  it("trial exatamente no instante do vencimento ainda é válido (>=)", () => {
    const exactly = new Date(NOW).toISOString();
    expect(hasEntitlement({ status: "trial", trial_end: exactly }, NOW)).toBe(true);
  });

  it("status desconhecido bloqueia (fail-safe)", () => {
    expect(hasEntitlement({ status: "qualquer-coisa" }, NOW)).toBe(false);
    expect(hasEntitlement({}, NOW)).toBe(false);
  });

  it("trial_end não-parseável bloqueia (NaN nunca é >= now)", () => {
    expect(hasEntitlement({ status: "trial", trial_end: "not-a-date" }, NOW)).toBe(false);
  });

  it("limite estrito do trial: 1ms antes bloqueia, 1ms depois libera", () => {
    expect(hasEntitlement({ status: "trial", trial_end: new Date(NOW - 1).toISOString() }, NOW)).toBe(false);
    expect(hasEntitlement({ status: "trial", trial_end: new Date(NOW + 1).toISOString() }, NOW)).toBe(true);
  });

  it("claim que não é objeto bloqueia (defensivo)", () => {
    expect(hasEntitlement("trial", NOW)).toBe(false);
    expect(hasEntitlement(123, NOW)).toBe(false);
    expect(hasEntitlement([], NOW)).toBe(false);
  });

  it("usa Date.now() quando 'now' não é passado (smoke)", () => {
    expect(hasEntitlement({ status: "active" })).toBe(true);
    expect(hasEntitlement(null)).toBe(false);
  });
});

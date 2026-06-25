import { describe, it, expect } from "vitest";
import { hasEntitlement, accessLevel, trialDaysLeft, billingNotice } from "../entitlement";

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

describe("accessLevel (tri-estado)", () => {
  const graceRef = "2026-06-20T00:00:00Z"; // 5 dias antes de NOW → dentro da carência (7d)
  const longPast = "2026-06-01T00:00:00Z"; // > 7 dias → bloqueado
  it("full: exempt / active / trial válido", () => {
    expect(accessLevel({ billing_exempt: true, status: "expired" }, NOW)).toBe("full");
    expect(accessLevel({ status: "active" }, NOW)).toBe("full");
    expect(accessLevel({ status: "trial", trial_end: future }, NOW)).toBe("full");
  });
  it("readonly: dentro da janela de carência", () => {
    expect(accessLevel({ status: "trial", trial_end: graceRef }, NOW)).toBe("readonly");
    expect(accessLevel({ status: "past_due", current_period_end: graceRef }, NOW)).toBe("readonly");
  });
  it("blocked: sem assinatura ou fora da carência", () => {
    expect(accessLevel(null, NOW)).toBe("blocked");
    expect(accessLevel({ status: "trial", trial_end: longPast }, NOW)).toBe("blocked");
    expect(accessLevel({ status: "canceled" }, NOW)).toBe("blocked");
  });
  it("limite exato da carência (7 dias)", () => {
    const exact = new Date(NOW - 7 * 86400000).toISOString();
    const justOver = new Date(NOW - 7 * 86400000 - 1).toISOString();
    expect(accessLevel({ status: "past_due", current_period_end: exact }, NOW)).toBe("readonly");
    expect(accessLevel({ status: "past_due", current_period_end: justOver }, NOW)).toBe("blocked");
  });
  it("past_due sem datas → blocked", () => {
    expect(accessLevel({ status: "past_due" }, NOW)).toBe("blocked");
  });
});

describe("trialDaysLeft", () => {
  it("conta dias e ignora não-trial", () => {
    expect(trialDaysLeft({ status: "trial", trial_end: "2026-06-27T00:00:00Z" }, NOW)).toBe(2);
    expect(trialDaysLeft({ status: "active" }, NOW)).toBeNull();
    expect(trialDaysLeft(null, NOW)).toBeNull();
  });
});

describe("billingNotice", () => {
  it("sem aviso: exempt / active / trial longe do fim", () => {
    expect(billingNotice({ billing_exempt: true }, NOW)).toBeNull();
    expect(billingNotice({ status: "active" }, NOW)).toBeNull();
    expect(billingNotice({ status: "trial", trial_end: future }, NOW)).toBeNull();
  });
  it("warning: trial ≤3 dias", () => {
    const n = billingNotice({ status: "trial", trial_end: "2026-06-27T00:00:00Z" }, NOW);
    expect(n.tone).toBe("warning");
    expect(n.href).toBe("/assinatura");
  });
  it("danger: past_due", () => {
    expect(billingNotice({ status: "past_due" }, NOW).tone).toBe("danger");
  });
  it("warning: carência (readonly)", () => {
    const n = billingNotice({ status: "trial", trial_end: "2026-06-20T00:00:00Z" }, NOW);
    expect(n.tone).toBe("warning");
  });
  it("past_due tem prioridade sobre trial", () => {
    expect(billingNotice({ status: "past_due", trial_end: future }, NOW).tone).toBe("danger");
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { addMonthsISO, normalizeRef, mapBillingType, transition } from "../asaasWebhook";
import { verifyWebhook } from "../asaas";

describe("addMonthsISO", () => {
  it("soma um mês simples", () => {
    expect(addMonthsISO("2026-06-25", 1)).toBe("2026-07-25");
  });
  it("faz clamp no fim do mês (sem overflow)", () => {
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsISO("2026-03-31", 1)).toBe("2026-04-30");
    expect(addMonthsISO("2024-01-31", 1)).toBe("2024-02-29"); // bissexto
  });
  it("vira o ano corretamente", () => {
    expect(addMonthsISO("2026-12-15", 1)).toBe("2027-01-15");
  });
});

describe("normalizeRef", () => {
  it("aceita string, objeto {id} e nulos", () => {
    expect(normalizeRef("sub_1")).toBe("sub_1");
    expect(normalizeRef({ id: "sub_2" })).toBe("sub_2");
    expect(normalizeRef(null)).toBeNull();
    expect(normalizeRef(undefined)).toBeNull();
    expect(normalizeRef({})).toBeNull();
    expect(normalizeRef(123)).toBeNull();
  });
});

describe("mapBillingType", () => {
  it("mapeia métodos conhecidos e ignora o resto", () => {
    expect(mapBillingType("CREDIT_CARD")).toBe("credit_card");
    expect(mapBillingType("PIX")).toBe("pix");
    expect(mapBillingType("BOLETO")).toBe("boleto");
    expect(mapBillingType("UNKNOWN")).toBeNull();
    expect(mapBillingType(undefined)).toBeNull();
  });
});

describe("transition", () => {
  it("PAYMENT_CONFIRMED → active + período (1 mês) + método", () => {
    const p = transition("PAYMENT_CONFIRMED", { dueDate: "2026-06-25", billingType: "PIX" });
    expect(p).toEqual({
      status: "active",
      current_period_start: "2026-06-25",
      current_period_end: "2026-07-25",
      payment_method: "pix",
    });
  });
  it("PAYMENT_RECEIVED também ativa", () => {
    expect(transition("PAYMENT_RECEIVED", { dueDate: "2026-06-25", billingType: "CREDIT_CARD" }).status).toBe("active");
  });
  it("confirmação sem billingType não sobrescreve payment_method", () => {
    const p = transition("PAYMENT_CONFIRMED", { dueDate: "2026-06-25" });
    expect(p.payment_method).toBeUndefined();
    expect(p.status).toBe("active");
  });
  it("OVERDUE/REFUNDED → past_due", () => {
    expect(transition("PAYMENT_OVERDUE", null)).toEqual({ status: "past_due" });
    expect(transition("PAYMENT_REFUNDED", {})).toEqual({ status: "past_due" });
  });
  it("SUBSCRIPTION_DELETED/INACTIVATED → canceled", () => {
    expect(transition("SUBSCRIPTION_DELETED", null)).toEqual({ status: "canceled" });
    expect(transition("SUBSCRIPTION_INACTIVATED", null)).toEqual({ status: "canceled" });
  });
  it("evento desconhecido → null (ignora)", () => {
    expect(transition("ALGO_NOVO", {})).toBeNull();
  });
});

describe("verifyWebhook", () => {
  afterEach(() => vi.unstubAllEnvs());
  const reqWith = (token) =>
    new Request("http://x", { headers: token == null ? {} : { "asaas-access-token": token } });

  it("aceita token correto", () => {
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "segredo-123");
    expect(verifyWebhook(reqWith("segredo-123"))).toBe(true);
  });
  it("rejeita token errado, ausente ou de tamanho diferente", () => {
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "segredo-123");
    expect(verifyWebhook(reqWith("errado-1234"))).toBe(false);
    expect(verifyWebhook(reqWith("xx"))).toBe(false); // length mismatch, não lança
    expect(verifyWebhook(reqWith(null))).toBe(false);
  });
  it("rejeita quando o token não está configurado (fail-closed)", () => {
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "");
    expect(verifyWebhook(reqWith("qualquer"))).toBe(false);
  });
});

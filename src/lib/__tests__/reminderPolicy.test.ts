import { describe, it, expect } from "vitest";
import {
  shouldRemind,
  spDateOf,
  daysBetween,
  tenantCanSendReminders,
  escapeHtml,
  MAX_REMINDERS,
  REMINDER_INTERVAL_DAYS,
} from "../reminderPolicy";
import { isValidEmail } from "../mailPolicy";

const TODAY = "2026-11-19";

describe("spDateOf / daysBetween", () => {
  it("usa o fuso de São Paulo (02h UTC ainda é o dia anterior)", () => {
    expect(spDateOf("2026-11-20T02:00:00Z")).toBe("2026-11-19");
    expect(spDateOf("2026-11-20T03:30:00Z")).toBe("2026-11-20");
  });
  it("conta dias de calendário", () => {
    expect(daysBetween("2026-11-10", TODAY)).toBe(9);
    expect(daysBetween(TODAY, TODAY)).toBe(0);
    expect(daysBetween("2026-10-31", "2026-11-01")).toBe(1);
  });
});

describe("shouldRemind", () => {
  it("não lembra o que ainda não venceu ou vence hoje", () => {
    expect(shouldRemind(TODAY, null, TODAY)).toBe(false);
    expect(shouldRemind("2026-11-25", null, TODAY)).toBe(false);
  });

  it("primeiro lembrete a partir de 1 dia de atraso", () => {
    expect(shouldRemind("2026-11-18", null, TODAY)).toBe(true);
    expect(shouldRemind("2025-09-03", { sentCount: 0, lastSentAt: null }, TODAY)).toBe(true);
  });

  it(`espera ${REMINDER_INTERVAL_DAYS} dias desde o último envio`, () => {
    const h = (iso: string) => ({ sentCount: 1, lastSentAt: iso });
    expect(shouldRemind("2026-11-01", h("2026-11-18T12:00:00Z"), TODAY)).toBe(false);
    expect(shouldRemind("2026-11-01", h("2026-11-13T12:00:00Z"), TODAY)).toBe(false);
    expect(shouldRemind("2026-11-01", h("2026-11-12T12:00:00Z"), TODAY)).toBe(true);
  });

  it(`para de lembrar após ${MAX_REMINDERS} envios`, () => {
    const h = { sentCount: MAX_REMINDERS, lastSentAt: "2026-01-01T12:00:00Z" };
    expect(shouldRemind("2025-12-01", h, TODAY)).toBe(false);
  });

  it("simulação: cron diário por 60 dias envia exatamente MAX_REMINDERS vezes", () => {
    const due = "2026-09-01";
    const h = { sentCount: 0, lastSentAt: null as string | null };
    const sentOn: number[] = [];
    for (let d = 0; d <= 60; d++) {
      const day = new Date(Date.parse(`${due}T12:00:00Z`) + d * 86_400_000);
      const today = day.toISOString().slice(0, 10);
      if (shouldRemind(due, h, today)) {
        h.sentCount += 1;
        h.lastSentAt = day.toISOString();
        sentOn.push(d);
      }
    }
    expect(sentOn).toEqual([1, 8, 15]);
  });
});

describe("tenantCanSendReminders", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  it("isenta, ativa ou trial vigente → envia", () => {
    expect(tenantCanSendReminders({ status: "trial", billing_exempt: true, trial_end: "2026-07-08T00:00:00Z" }, now)).toBe(true);
    expect(tenantCanSendReminders({ status: "active", billing_exempt: false }, now)).toBe(true);
    expect(tenantCanSendReminders({ status: "trial", billing_exempt: false, trial_end: "2026-12-01T00:00:00Z" }, now)).toBe(true);
  });
  it("expirada, em carência ou sem assinatura → não envia", () => {
    expect(tenantCanSendReminders({ status: "expired", billing_exempt: false, trial_end: "2026-07-23T00:00:00Z" }, now)).toBe(false);
    expect(tenantCanSendReminders({ status: "past_due", billing_exempt: false, current_period_end: "2026-11-17T00:00:00Z" }, now)).toBe(false);
    expect(tenantCanSendReminders(null, now)).toBe(false);
  });
});

describe("escapeHtml / isValidEmail", () => {
  it("escapa nomes vindos do cadastro", () => {
    expect(escapeHtml(`<b>"Zé" & 'Cia'</b>`)).toBe("&lt;b&gt;&quot;Zé&quot; &amp; &#39;Cia&#39;&lt;/b&gt;");
  });
  it("rejeita e-mail sem @ (caso real no cadastro)", () => {
    expect(isValidEmail("financeiro.empresa.com.br")).toBe(false);
    expect(isValidEmail(" pagador@escola.com.br ")).toBe(true);
    expect(isValidEmail(null)).toBe(false);
  });
});

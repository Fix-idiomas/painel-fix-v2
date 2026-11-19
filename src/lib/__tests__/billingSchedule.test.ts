import { describe, it, expect } from "vitest";
import {
  pastDueCutoffIso,
  daysOverdue,
  shouldSendDunning,
  blockDateBR,
  EXPIRE_GRACE_DAYS,
} from "../billingSchedule";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-28T13:00:00Z"); // horário do cron de dunning

describe("pastDueCutoffIso", () => {
  it(`fica ${EXPIRE_GRACE_DAYS} dias antes de agora`, () => {
    expect(pastDueCutoffIso(NOW)).toBe("2026-07-25T13:00:00.000Z");
  });
  it("no próprio dia do vencimento o pagante NÃO entra no corte", () => {
    const periodEnd = Date.parse("2026-07-28T00:00:00Z");
    const cronRun = Date.parse("2026-07-28T06:00:00Z"); // expire-subscriptions (06:00 UTC)
    expect(periodEnd < Date.parse(pastDueCutoffIso(cronRun))).toBe(false);
  });
});

describe("daysOverdue", () => {
  it("conta dias inteiros desde o fim do período", () => {
    expect(daysOverdue("2026-07-27T00:00:00Z", NOW)).toBe(1);
    expect(daysOverdue("2026-07-28T00:00:00Z", NOW)).toBe(0);
    expect(daysOverdue("2026-07-22T00:00:00Z", NOW)).toBe(6);
  });
  it("datas ausentes ou inválidas → null", () => {
    expect(daysOverdue(null, NOW)).toBeNull();
    expect(daysOverdue("lixo", NOW)).toBeNull();
  });
});

describe("shouldSendDunning", () => {
  it("só nos dias 1, 3 e 6 de atraso", () => {
    const sentOn = [];
    for (let d = 0; d <= 10; d++) {
      const periodEnd = new Date(NOW - d * DAY - 3_600_000).toISOString(); // d dias + 1h
      if (shouldSendDunning(periodEnd, NOW)) sentOn.push(d);
    }
    expect(sentOn).toEqual([1, 3, 6]);
  });
  it("sem data de período não envia (evita e-mail diário)", () => {
    expect(shouldSendDunning(null, NOW)).toBe(false);
  });
});

describe("blockDateBR", () => {
  it("fim do período + 7 dias, em pt-BR (fuso SP)", () => {
    expect(blockDateBR("2026-07-25T12:00:00Z")).toBe("01/08/2026");
  });
  it("ausente → null", () => {
    expect(blockDateBR(null)).toBeNull();
  });
});

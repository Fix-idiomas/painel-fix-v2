import { describe, it, expect } from "vitest";
import { reconcilePlan } from "../subscriptionReconcile";

const sub = (id, status = "ACTIVE", deleted = false) => ({ id, status, deleted });

describe("reconcilePlan", () => {
  it("sem assinaturas ativas → nada a fazer", () => {
    const p = reconcilePlan([], "sub_1");
    expect(p.cancelIds).toEqual([]);
    expect(p.review).toBe(false);
  });

  it("ignora deletadas (já canceladas) ao decidir", () => {
    const p = reconcilePlan([sub("sub_1"), sub("sub_old", "ACTIVE", true)], "sub_1");
    expect(p.cancelIds).toEqual([]);
    expect(p.review).toBe(false);
  });

  it("verdadeira confirmada + extras → cancela só os extras", () => {
    const p = reconcilePlan([sub("sub_1"), sub("orfa_a"), sub("orfa_b")], "sub_1");
    expect(p.cancelIds.sort()).toEqual(["orfa_a", "orfa_b"]);
    expect(p.review).toBe(false);
  });

  it("só a verdadeira ativa → não cancela nada", () => {
    const p = reconcilePlan([sub("sub_1")], "sub_1");
    expect(p.cancelIds).toEqual([]);
    expect(p.review).toBe(false);
  });

  it("AMBÍGUO: storedId não está entre as ativas → revisão, NÃO cancela", () => {
    const p = reconcilePlan([sub("outra_1"), sub("outra_2")], "sub_1");
    expect(p.cancelIds).toEqual([]);
    expect(p.review).toBe(true);
  });

  it("AMBÍGUO: storedId nulo com ativa(s) → revisão, NÃO cancela", () => {
    const p = reconcilePlan([sub("orfa_x")], null);
    expect(p.cancelIds).toEqual([]);
    expect(p.review).toBe(true);
  });

  it("storedId nulo e nenhuma ativa → nada (sem revisão)", () => {
    const p = reconcilePlan([sub("antiga", "ACTIVE", true)], null);
    expect(p.cancelIds).toEqual([]);
    expect(p.review).toBe(false);
  });

  it("defensivo: entradas nulas/sem id não quebram", () => {
    const p = reconcilePlan([null, sub("sub_1")], "sub_1");
    expect(p.review).toBe(false);
    expect(p.cancelIds).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { validateMailPayload, MAX_RECIPIENTS } from "../mailPolicy";

describe("validateMailPayload", () => {
  it("aceita payload válido e normaliza destinatários", () => {
    const r = validateMailPayload({ to: " A@X.com , b@y.com.br,a@x.com", subject: " Oi ", html: "<p>x</p>" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.to).toEqual(["a@x.com", "b@y.com.br"]);
      expect(r.payload.subject).toBe("Oi");
    }
  });

  it("aceita array em 'to' e só texto", () => {
    const r = validateMailPayload({ to: ["a@x.com"], subject: "s", text: "t" });
    expect(r.ok).toBe(true);
  });

  it("rejeita campos ausentes", () => {
    expect(validateMailPayload(null).ok).toBe(false);
    expect(validateMailPayload({ to: "", subject: "s", html: "x" }).ok).toBe(false);
    expect(validateMailPayload({ to: "a@x.com", subject: "", html: "x" }).ok).toBe(false);
    expect(validateMailPayload({ to: "a@x.com", subject: "s", html: "  " }).ok).toBe(false);
  });

  it("rejeita e-mail inválido", () => {
    const r = validateMailPayload({ to: "a@x.com, nao-e-email", subject: "s", text: "t" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("nao-e-email");
  });

  it("limita o número de destinatários", () => {
    const to = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `u${i}@x.com`);
    expect(validateMailPayload({ to, subject: "s", text: "t" }).ok).toBe(false);
    expect(validateMailPayload({ to: to.slice(0, MAX_RECIPIENTS), subject: "s", text: "t" }).ok).toBe(true);
  });

  it("limita assunto e corpo", () => {
    expect(validateMailPayload({ to: "a@x.com", subject: "s".repeat(201), text: "t" }).ok).toBe(false);
    expect(validateMailPayload({ to: "a@x.com", subject: "s", html: "x".repeat(100_001) }).ok).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { mergeEditablePerms } from "../permsPolicy";

describe("mergeEditablePerms", () => {
  it("altera só as áreas editáveis e preserva o resto", () => {
    const current = {
      meta: { label: "teacher B" },
      reports: { read: true },
      finance: { read: true, write: true },
      classes: { read: false, write: false },
    };
    const out = mergeEditablePerms(current, {
      finance: { read: false, write: false },
      classes: { read: true, write: false },
      settings: { read: true, write: true }, // não editável → ignorado
    });
    expect(out).toEqual({
      meta: { label: "teacher B" },
      reports: { read: true },
      finance: { read: false, write: false },
      classes: { read: true, write: false },
    });
  });

  it("write implica read", () => {
    const out = mergeEditablePerms({}, { registry: { read: false, write: true } });
    expect(out.registry).toEqual({ read: true, write: true });
  });

  it("só aceita booleanos true (strings não concedem permissão)", () => {
    const out = mergeEditablePerms({}, { finance: { read: "true", write: 1 } });
    expect(out.finance).toEqual({ read: false, write: false });
  });

  it("tolera perms atuais nulos ou inválidos", () => {
    expect(mergeEditablePerms(null, { classes: { read: true } })).toEqual({
      classes: { read: true, write: false },
    });
    expect(mergeEditablePerms([1, 2], {})).toEqual({});
  });
});

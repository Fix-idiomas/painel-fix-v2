// Lógica pura de mescla de permissões (user_claims.perms). Sem IO — testável.
// A UI de /conta edita apenas estas áreas; o resto do objeto (meta.label,
// reports, agenda, ...) é preservado como está.

export const EDITABLE_AREAS = ["classes", "finance", "registry"] as const;

type Dict = Record<string, unknown>;

export function mergeEditablePerms(current: unknown, incoming: unknown): Dict {
  const base: Dict =
    current && typeof current === "object" && !Array.isArray(current) ? { ...(current as Dict) } : {};
  const inc: Dict =
    incoming && typeof incoming === "object" && !Array.isArray(incoming) ? (incoming as Dict) : {};

  for (const area of EDITABLE_AREAS) {
    const v = inc[area] as Dict | undefined;
    if (!v || typeof v !== "object") continue; // área ausente → mantém a atual
    const write = v.write === true;
    // write implica read (escrever sem ler não faz sentido na UI)
    base[area] = { read: v.read === true || write, write };
  }
  return base;
}

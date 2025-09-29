// src/lib/navConfig.js

/**
 * Definição canônica das entradas de navegação.
 * Somente dados e regras — nada de UI aqui.
 *
 * Regras:
 * - Admin vê tudo.
 * - User comum vê apenas o que "perms" permitir (vindo do SessionContext).
 */

export const NAV_ITEMS = [
  { key: "home",       label: "Início",      href: "/",              meta: { icon: "home" } },
  { key: "cadastro",   label: "Cadastro",    href: "/cadastro",      perm: { area: "registry",  action: "read" }, meta: { icon: "folder" } },
  { key: "turmas",     label: "Turmas",      href: "/turmas",        perm: { area: "classes",   action: "read" }, meta: { icon: "teacher" } },
  { key: "agenda",     label: "Agenda",      href: "/agenda",        perm: { area: "classes",   action: "read" }, meta: { icon: "calendar" } },
  { key: "relatorios", label: "Relatórios",  href: "/relatorios",    meta: { icon: "chart" } },
  { key: "financeiro", label: "Financeiro",  href: "/financeiro",    perm: { area: "finance",   action: "read" }, meta: { icon: "money" } },

  // 🔒 Admin-only (owner/admin) — aponta para /configuracoes
  { key: "config",     label: "Configurações", href: "/configuracoes", requireAdmin: true, meta: { icon: "settings" } },
];

/** Decide se um item é visível dado isAdmin e perms do SessionContext. */
export function isItemVisible(item, { isAdmin, perms }) {
  if (isAdmin) return true;
  if (!item.perm) {
    // Itens “básicos” quando não há perm específica
    return ["home", "relatorios"].includes(item.key);
  }
  const { area, action } = item.perm;
  const areaObj = perms?.[area];
  return !!areaObj?.[action];
}

/** Retorna a lista já filtrada, mantendo a ordem. */
export function getVisibleNav({ isAdmin, perms }) {
  return NAV_ITEMS.filter((it) => {
    // Admin-only
    if (it.requireAdmin) return !!isAdmin;

    // Itens sem permissão específica
    if (!it.perm) return true;

    // Itens baseados em permissões (ex.: classes.read, finance.read, etc.)
    const { area, action } = it.perm;
    return !!perms?.[area]?.[action];
  });
}
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
  { key: "home",       label: "Início",      href: "/" },
  { key: "cadastro",   label: "Cadastro",    href: "/cadastro",   perm: { area: "registry",  action: "read" } },
  { key: "turmas",     label: "Turmas",      href: "/turmas",     perm: { area: "classes",   action: "read" } },
  { key: "agenda",     label: "Agenda",      href: "/agenda",     perm: { area: "classes",   action: "read" } },
  { key: "relatorios", label: "Relatórios",  href: "/relatorios" },
  { key: "financeiro", label: "Financeiro",  href: "/financeiro", perm: { area: "finance",   action: "read" } },
  { key: "config",     label: "Configurações", href: "/config",   perm: { area: "admin",     action: "read" }, meta: { icon: "settings" } },
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
export function getVisibleNav(sessionContext) {
  const { isAdmin, perms } = sessionContext || {};
  return NAV_ITEMS.filter((it) => isItemVisible(it, { isAdmin, perms }));
}

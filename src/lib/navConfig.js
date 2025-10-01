// src/lib/navConfig.js
/**
 * Definição canônica das entradas de navegação.
 * Somente dados e regras — nada de UI aqui.
 *
 * Regras:
 * - Admin vê tudo.
 * - User comum vê apenas o que "perms" permitir (vindo do SessionContext).
 */
// src/lib/navConfig.js

export const NAV_ITEMS = [
  // Sempre visível
  { key: "home", label: "Início", href: "/recepcao", meta: { icon: "home" } },

  // Dashboard só p/ admin/owner
  { key: "dashboard", label: "Dashboard", href: "/", requireAdmin: true, meta: { icon: "gauge" } },

  // Itens dependentes de permissão
  { key: "turmas",   label: "Turmas",   href: "/turmas",   perm: { area: "classes",  action: "read" }, meta: { icon: "teacher" } },
  { key: "agenda",   label: "Agenda",   href: "/agenda",   perm: { area: "classes",  action: "read" }, meta: { icon: "calendar" } },
  { key: "relatorios", label: "Relatórios", href: "/relatorios", meta: { icon: "chart" } },
  { key: "financeiro", label: "Financeiro", href: "/financeiro", perm: { area: "finance", action: "read" }, meta: { icon: "money" } },
  { key: "cadastro",   label: "Cadastro",   href: "/cadastro",   perm: { area: "registry", action: "read" }, meta: { icon: "folder" } },

  // Admin-only
  { key: "config", label: "Configurações", href: "/configuracoes", requireAdmin: true, meta: { icon: "settings" } },
];
export function isItemVisible(item, { isAdmin, perms }) {
  if (isAdmin) return true;
  if (item.requireAdmin) return false;

  // Itens sem perm específica liberados por padrão
  if (!item.perm) return ["home", "relatorios"].includes(item.key);

  const { area, action } = item.perm;
  return !!perms?.[area]?.[action];
}

export function getVisibleNav({ isAdmin, perms }) {
  return NAV_ITEMS.filter((it) => isItemVisible(it, { isAdmin, perms }));
}
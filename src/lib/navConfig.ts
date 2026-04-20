export interface NavItemPerm {
  area: string;
  action: string;
}

export interface NavItem {
  key: string;
  label: string;
  href: string;
  requireAdmin?: boolean;
  perm?: NavItemPerm;
  meta?: { icon?: string };
}

export interface NavContext {
  isAdmin: boolean;
  perms: Record<string, Record<string, boolean>> | null | undefined;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Início", href: "/recepcao", meta: { icon: "home" } },
  { key: "dashboard", label: "Dashboard", href: "/", requireAdmin: true, meta: { icon: "gauge" } },
  { key: "turmas",   label: "Turmas",   href: "/turmas",   perm: { area: "classes",  action: "read" }, meta: { icon: "teacher" } },
  { key: "agenda",   label: "Agenda",   href: "/agenda",   perm: { area: "classes",  action: "read" }, meta: { icon: "calendar" } },
  { key: "relatorios", label: "Relatórios", href: "/relatorios", meta: { icon: "chart" } },
  { key: "financeiro", label: "Financeiro", href: "/financeiro", perm: { area: "finance", action: "read" }, meta: { icon: "money" } },
  { key: "cadastro",   label: "Cadastro",   href: "/cadastro",   perm: { area: "registry", action: "read" }, meta: { icon: "folder" } },
  { key: "config", label: "Configurações", href: "/configuracoes", requireAdmin: true, meta: { icon: "settings" } },
];

export function isItemVisible(item: NavItem, { isAdmin, perms }: NavContext): boolean {
  if (isAdmin) return true;
  if (item.requireAdmin) return false;
  if (!item.perm) return ["home", "relatorios"].includes(item.key);
  const { area, action } = item.perm;
  return !!perms?.[area]?.[action];
}

export function getVisibleNav({ isAdmin, perms }: NavContext): NavItem[] {
  return NAV_ITEMS.filter((it) => isItemVisible(it, { isAdmin, perms }));
}

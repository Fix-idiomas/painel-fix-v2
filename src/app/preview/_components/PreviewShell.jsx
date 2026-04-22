"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Calendar,
  DollarSign,
  BarChart3,
  Settings,
  Menu,
  X,
  Search,
  Bell,
  LogOut,
  ChevronDown,
} from "lucide-react";

const NAV = [
  { key: "home",       label: "Início",       href: "/preview/dashboard", icon: LayoutDashboard },
  { key: "cadastro",   label: "Cadastro",     href: "/preview/alunos",    icon: Users },
  { key: "turmas",     label: "Turmas",       href: "/preview/turmas",    icon: BookOpen },
  { key: "agenda",     label: "Agenda",       href: "/preview/agenda",    icon: Calendar },
  { key: "financeiro", label: "Financeiro",   href: "/preview/financeiro", icon: DollarSign },
  { key: "relatorios", label: "Relatórios",   href: "/preview/relatorios", icon: BarChart3 },
  { key: "config",     label: "Configurações", href: "/preview/config",   icon: Settings },
];

export default function PreviewShell({
  active,          // nav key
  crumb,           // small kicker above title (optional)
  title,           // page title shown in top bar (optional)
  showSearch = true,
  rightAction,     // ReactNode for right side of topbar (optional)
  children,
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen md:flex">
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[var(--p-border)] bg-[var(--p-surface)] transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
          "md:static md:translate-x-0 md:w-60 md:shrink-0 md:h-screen md:sticky md:top-0",
        ].join(" ")}
        aria-label="Menu lateral"
      >
        {/* Brand */}
        <div className="flex items-center justify-between border-b border-[var(--p-border)] px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--p-primary)] text-white font-semibold text-sm shadow-sm">F</div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight truncate">Fix Idiomas</div>
              <div className="text-[11px] text-[var(--p-text-muted)] leading-tight">painel · preview</div>
            </div>
          </div>
          <button
            className="md:hidden -mr-1 rounded-md p-1 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-[var(--p-text-faint)]">
            Menu
          </div>
          <ul className="flex flex-col gap-0.5">
            {NAV.map((it) => {
              const Icon = it.icon;
              const isActive = active === it.key;
              return (
                <li key={it.key}>
                  <Link
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className={[
                      "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-[var(--p-primary)] text-white shadow-sm"
                        : "text-[var(--p-text)] hover:bg-[var(--p-surface-2)]",
                    ].join(" ")}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-[var(--p-text-muted)] group-hover:text-[var(--p-text)]"}`} />
                    <span className="truncate">{it.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User block */}
        <div className="border-t border-[var(--p-border)] p-3">
          <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--p-surface-2)]">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--p-primary-50)] text-[var(--p-primary)] text-xs font-semibold">V</div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-medium truncate">Vinícius Penteado</div>
              <div className="text-[11px] text-[var(--p-text-muted)] truncate">Proprietário</div>
            </div>
            <ChevronDown className="h-3 w-3 text-[var(--p-text-faint)]" />
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-[var(--p-border)] bg-[var(--p-surface)]/80 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 md:px-8">
            <button
              onClick={() => setOpen(true)}
              className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] hover:bg-[var(--p-surface-2)]"
              aria-label="Abrir menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex min-w-0 flex-1 flex-col">
              {crumb && (
                <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--p-text-faint)] leading-none">
                  {crumb}
                </div>
              )}
              {title && (
                <div className="mt-0.5 text-sm font-semibold truncate md:text-base">
                  {title}
                </div>
              )}
            </div>

            {showSearch && (
              <div className="relative hidden md:block w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--p-text-faint)]" />
                <input
                  type="text"
                  placeholder="Buscar…"
                  className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-2)] py-2 pl-9 pr-3 text-sm placeholder:text-[var(--p-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
                />
              </div>
            )}

            <button
              aria-label="Notificações"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] hover:bg-[var(--p-surface-2)] relative"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[var(--p-primary)]"></span>
            </button>

            {rightAction}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/contexts/SessionContext";
import { getVisibleNav } from "@/lib/navConfig";

/**
 * Sidebar colapsável:
 * - Colapsada: mostra só ícones.
 * - Expandida: mostra ícones + rótulos.
 * - Destaca item ativo pela rota atual.
 * - Respeita permissões (usa getVisibleNav).
 *
 * Importante: este componente AINDA NÃO ESTÁ no layout.
 * No próximo passo a gente integra no (app)/layout.jsx.
 */

const LS_KEY = "pf.sidebar.collapsed";

export default function Sidebar() {
  const pathname = usePathname();
  const { ready, isAdmin, perms } = useSession();

  // estado de colapso (persistido)
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw != null) setCollapsed(raw === "1");
    } catch { /* noop */ }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, collapsed ? "1" : "0");
    } catch { /* noop */ }
  }, [collapsed]);

  // itens de navegação visíveis conforme sessão
  const items = useMemo(() => {
    if (!ready) return [{ key: "home", label: "Início", href: "/" }];
    return getVisibleNav({ isAdmin, perms });
  }, [ready, isAdmin, perms]);

  // mapa de “ícones” simples (pode trocar por um set de SVGs depois)
  const iconOf = (key) => {
    switch (key) {
      case "home":        return "🏠";
      case "cadastro":    return "🗂️";
      case "turmas":      return "👩‍🏫";
      case "agenda":      return "🗓️";
      case "relatorios":  return "📊";
      case "financeiro":  return "💰";
      case "config":      return "⚙️";
      default:            return "•";
    }
  };

  return (
    <aside
      className={`h-screen border-r border-[var(--fix-border)] bg-[var(--fix-surface)] transition-all duration-200
         ${collapsed ? "w-14" : "w-60"}`}
      aria-label="Menu lateral de navegação"
    >
      {/* topo: logo/nome + botão de colapso */}
     <div className="flex items-center justify-between gap-2 border-b border-[var(--fix-border)] px-3 py-3">
         <div className={`font-semibold truncate text-[var(--fix-text)] ${collapsed ? "opacity-0 pointer-events-none" : ""}`}>
          Painel Fix
        </div>
        <button
          type="button"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className="rounded border border-[var(--fix-border)] px-2 py-1 text-xs text-[var(--fix-text)] hover:bg-gray-100"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {/* lista de navegação */}
      <nav className="mt-2 flex flex-col gap-1 px-2" role="navigation">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link
              key={it.key}
              href={it.href}
              className={[
                "group flex items-center gap-3 rounded-md px-2 py-2 text-sm",
                active
                 ? "bg-[var(--fix-primary)] text-white"
                  : "text-[var(--fix-text)] hover:bg-gray-100",
              ].join(" ")}
              title={collapsed ? it.label : undefined}
            >
              <span className="w-5 shrink-0 text-center">{iconOf(it.key)}</span>
              <span className={`truncate transition-opacity ${collapsed ? "opacity-0 pointer-events-none w-0" : "opacity-100"}`}>
                {it.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* rodapé opcional do rail */}
      <div className="mt-auto px-2 py-3 text-[11px] text-[var(--fix-text-muted)]">
        <div className={`truncate ${collapsed ? "opacity-0 pointer-events-none" : ""}`}>
          v2 • Fix Idiomas
        </div>
      </div>
    </aside>
  );
}

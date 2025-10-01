// src/components/Sidebar.jsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/contexts/SessionContext";
import { getVisibleNav } from "@/lib/navConfig";
import { supabaseGateway } from "@/lib/supabaseGateway";

export default function Sidebar({ open = false, onClose }) {
  const pathname = usePathname();
  const { ready, isAdmin, perms } = useSession();

  // === estado de colapso + hover (rail) ===
  const STORAGE_KEY = "fix.sidebar.collapsed";
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const railCollapsed = collapsed && !open && !hovering;

  const handleEnter = () => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setHovering(true);
    }
  };
  const handleLeave = () => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setHovering(false);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "1") setCollapsed(true);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {}
  }, [collapsed]);

  // === itens de navegação ===
  const items = useMemo(() => {
    if (!ready) return [{ key: "home", label: "Início", href: "/" }];
    return getVisibleNav({ isAdmin, perms });
  }, [ready, isAdmin, perms]);

  // === branding do tenant (logo + nome) ===
  const [brandName, setBrandName] = useState("Painel Fix");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await supabaseGateway.getTenantSettings?.();
        if (!alive) return;
        if (s?.brand_name) setBrandName(String(s.brand_name));
        // RPC retorna logo em logo_url
        if (s?.logo_url) setBrandLogoUrl(String(s.logo_url));
      } catch {
        // keep defaults
      }
    })();
    return () => { alive = false; };
  }, []);

  // ícones simples (placeholder)
  const iconOf = (key) => {
    switch (key) {
      case "home":        return "🏠";
      case "cadastro":    return "🗂️";
      case "turmas":      return "👩‍🏫";
      case "agenda":      return "🗓️";
      case "relatorios":  return "📊";
      case "financeiro":  return "💰";
      case "config":      return "⚙️";
      case "dashboard":   return "📈";
      default:            return "•";
    }
  };

  return (
    <aside
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      aria-label="Menu lateral de navegação"
      className={[
        // desktop shell
        "md:static md:h-screen md:border-r md:border-[var(--fix-border)] md:bg-[var(--fix-surface)] md:transition-all md:duration-200",
        railCollapsed ? "md:w-14" : "md:w-60",
        // mobile drawer
        "fixed inset-y-0 left-0 z-50 w-64 border-r border-[var(--fix-border)] bg-[var(--fix-surface)] shadow-xl md:shadow-none",
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        "transition-transform duration-200",
      ].join(" ")}
    >
     {/* topo: logo > nome > fallback */}
<div className="flex items-center justify-between gap-2 border-b border-[var(--fix-border)] px-3 py-3">
  <div className="flex items-center gap-2 min-w-0">
    {(() => {
      const logo = (brandLogoUrl || "").trim();
      const name = (brandName || "").trim();
      if (logo) {
        return (
          <img
            src={logo}
            alt={name || "Logo"}
            className={["object-contain", railCollapsed ? "h-10 w-10 mx-auto" : "h-10 w-auto"].join(" ")}
            draggable={false}
          />
        );
      }
      if (name) {
        return (
          <div
            className={[
              "font-semibold truncate text-[var(--fix-text)]",
              railCollapsed ? "opacity-0 pointer-events-none w-0" : "opacity-100",
            ].join(" ")}
            title={name}
          >
            {name}
          </div>
        );
      }
      return (
        <img
          src="/logo.png"
          alt="Logo padrão"
          className={["object-contain", railCollapsed ? "h-10 w-10 mx-auto" : "h-10 w-auto"].join(" ")}
          draggable={false}
        />
      );
    })()}
  </div>

  <button
    type="button"
    aria-label={railCollapsed ? "Expandir menu" : "Recolher menu"}
    className="rounded border border-[var(--fix-border)] px-2 py-1 text-xs text-[var(--fix-text)] hover:bg-gray-100"
    onClick={() => setCollapsed((v) => !v)}
  >
    {railCollapsed ? "›" : "‹"}
  </button>
</div>

      {/* navegação */}
      <nav className="mt-2 flex flex-col gap-1 px-2" role="navigation">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          return (
            <Link
              key={it.key}
              href={it.href}
              className={[
                "group flex items-center gap-3 rounded-md px-2 py-2 text-sm",
                active ? "bg-[var(--fix-primary)] text-white" : "text-[var(--fix-text)] hover:bg-gray-100",
              ].join(" ")}
              title={railCollapsed ? it.label : undefined}
              onClick={() => onClose?.()} // fecha no mobile ao navegar
            >
              <span className="w-5 shrink-0 text-center">{iconOf(it.key)}</span>
              <span
                className={[
                  "truncate transition-opacity",
                  railCollapsed ? "opacity-0 pointer-events-none w-0" : "opacity-100",
                ].join(" ")}
              >
                {it.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* rodapé */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-[var(--fix-border)] p-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex w-full items-center justify-center gap-2 rounded border px-2 py-2 text-sm hover:bg-[var(--fix-hover)]"
          aria-label={collapsed ? "Expandir menu" : "Colapsar menu"}
          title={collapsed ? "Expandir" : "Colapsar"}
        >
          <span className={`i-lucide-${collapsed ? "panel-right-open" : "panel-left"} h-4 w-4`} />
          {!collapsed && <span>Colapsar</span>}
        </button>
      </div>
    </aside>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
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
  ChevronDown,
  Home,
  IdCard,
  LogOut,
} from "lucide-react";

import { useSession } from "@/contexts/SessionContext";
import { getVisibleNav } from "@/lib/navConfig";
import { supabaseGateway } from "@/lib/supabaseGateway";

// ─────────────────────────────────────────────────────────────────
// Mapping nav keys → Lucide icon. Falls back to a generic icon.
// ─────────────────────────────────────────────────────────────────
const ICON_BY_KEY = {
  home: Home,
  dashboard: LayoutDashboard,
  cadastro: Users,
  turmas: BookOpen,
  agenda: Calendar,
  financeiro: DollarSign,
  relatorios: BarChart3,
  config: Settings,
};

function NavIcon({ navKey, className }) {
  const Icon = ICON_BY_KEY[navKey] || LayoutDashboard;
  return <Icon className={className} />;
}

// ─────────────────────────────────────────────────────────────────
// User block at the bottom of the sidebar — session-aware, with
// dropdown for "Minha conta" + "Sair". Mirrors logic from UserMenu.jsx.
// ─────────────────────────────────────────────────────────────────
function UserBlock({ name, role }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    function onDocClick(e) {
      if (!open) return;
      if (
        popRef.current &&
        !popRef.current.contains(e.target) &&
        btnRef.current &&
        !btnRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  async function onLogout() {
    try {
      setSigningOut(true);
      await supabase.auth.signOut({ scope: "local" });
      try {
        localStorage.removeItem("pf.session.ui");
      } catch {}
      window.location.replace("/login");
    } catch (e) {
      console.warn("Falha no logout:", e?.message || e);
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  }

  const initials = (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";

  const roleLabel =
    role === "owner" ? "Proprietário" : role === "admin" ? "Administrador" : "Membro";

  return (
    <div className="relative border-t border-[var(--p-border)] p-3">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--p-surface-2)]"
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--p-primary-50)] text-[var(--p-primary)] text-xs font-semibold">
          {initials}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-medium truncate">{name || "Usuário"}</div>
          <div className="text-[11px] text-[var(--p-text-muted)] truncate">{roleLabel}</div>
        </div>
        <ChevronDown
          className={`h-3 w-3 text-[var(--p-text-faint)] transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          ref={popRef}
          role="menu"
          aria-label="Menu do usuário"
          className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] shadow-lg z-50"
        >
          <Link
            href="/conta"
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--p-surface-2)]"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <IdCard className="h-4 w-4" aria-hidden="true" />
            Minha conta
          </Link>
          <div className="my-1 h-px bg-[var(--p-border)]" />
          <button
            type="button"
            onClick={onLogout}
            disabled={signingOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--p-surface-2)] disabled:opacity-60"
            role="menuitem"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {signingOut ? "Saindo…" : "Sair"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AppShell — main app chrome (sidebar + topbar). Designed to be
// mounted at the (app) layout level. Pages can pass `crumb`, `title`,
// and `rightAction` via the `<AppShellSlots>` mechanism if needed,
// but defaults are derived from the active nav item.
// ─────────────────────────────────────────────────────────────────
export default function AppShell({ children, crumb, title, rightAction, showSearch = true }) {
  const pathname = usePathname();
  const { ready, isAdmin, perms, session } = useSession();
  const [open, setOpen] = useState(false);

  // Tenant branding (logo + name); falls back to defaults
  const [brandName, setBrandName] = useState("Fix Idiomas");
  const [brandLogoUrl, setBrandLogoUrl] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await supabaseGateway.getTenantSettings?.();
        if (!alive) return;
        if (s?.brand_name) setBrandName(String(s.brand_name));
        if (s?.logo_url) setBrandLogoUrl(String(s.logo_url));
        // Aplica brand_color do tenant nos tokens globais (--fix-primary
        // alimenta --p-primary via globals.css).
        const brand = (s?.brand_color || "").trim();
        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(brand)) {
          document.documentElement.style.setProperty("--fix-primary", brand);
        }
      } catch {
        // keep defaults
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const items = useMemo(() => {
    if (!ready) return [];
    return getVisibleNav({ isAdmin, perms });
  }, [ready, isAdmin, perms]);

  const activeItem = useMemo(() => {
    if (!pathname) return null;
    return (
      items.find(
        (it) => pathname === it.href || pathname.startsWith(it.href + "/")
      ) || null
    );
  }, [items, pathname]);

  const effectiveTitle = title ?? activeItem?.label ?? "Painel";
  const effectiveCrumb = crumb ?? brandName;

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
          <Link href="/painel" className="flex items-center gap-2.5 min-w-0">
            {brandLogoUrl ? (
              <img
                src={brandLogoUrl}
                alt={brandName}
                className="h-9 w-9 rounded-lg object-contain"
                draggable={false}
              />
            ) : (
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--p-primary)] text-white font-semibold text-sm shadow-sm">
                {(brandName || "F").trim().charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight truncate">{brandName}</div>
              <div className="text-[11px] text-[var(--p-text-muted)] leading-tight">painel</div>
            </div>
          </Link>
          <button
            className="md:hidden -mr-1 rounded-md p-1 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3" role="navigation">
          <div className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-[var(--p-text-faint)]">
            Menu
          </div>
          <ul className="flex flex-col gap-0.5">
            {items.map((it) => {
              const isActive =
                pathname === it.href || (it.href !== "/" && pathname.startsWith(it.href + "/"));
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
                    <NavIcon
                      navKey={it.key}
                      className={`h-4 w-4 ${
                        isActive
                          ? "text-white"
                          : "text-[var(--p-text-muted)] group-hover:text-[var(--p-text)]"
                      }`}
                    />
                    <span className="truncate">{it.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User block */}
        <UserBlock name={session?.name} role={session?.role} />
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
              {effectiveCrumb && (
                <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--p-text-faint)] leading-none">
                  {effectiveCrumb}
                </div>
              )}
              {effectiveTitle && (
                <div className="mt-0.5 text-sm font-semibold truncate md:text-base">
                  {effectiveTitle}
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
                  aria-label="Buscar (em breve)"
                  disabled
                />
              </div>
            )}

            <button
              type="button"
              aria-label="Notificações (em breve)"
              disabled
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] hover:bg-[var(--p-surface-2)] relative disabled:opacity-60"
            >
              <Bell className="h-4 w-4" />
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

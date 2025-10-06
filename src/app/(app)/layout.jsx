// src/app/(app)/layout.jsx
"use client";

import { useState, useEffect } from "react";
import { SessionProvider } from "@/contexts/SessionContext";
import Sidebar from "@/components/Sidebar";
import { supabaseGateway } from "@/lib/supabaseGateway";
import UserMenu from "@/components/UserMenu";
import { usePathname } from "next/navigation";
import { Menu, User, ChevronDown } from "lucide-react";
  
export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const isInicio = pathname === "/inicio"; // <- detecta se é a rota inicio


  // Opcional: mantive para futuros usos (cores/brand no app)
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [brandName, setBrandName] = useState("Painel Fix v2");

  useEffect(() => {
    // 1) defaults seguros (tokens CSS)
    const root = document.documentElement;
    const set = (k, v) => root.style.setProperty(k, v);
    set("--fix-primary", "#9b1237");
    set("--fix-surface", "#ffffff");
    set("--fix-border", "#e5e7eb");
    set("--fix-text", "#111827");
    set("--fix-text-muted", "#6b7280");
    set("--fix-hover", "#f3f4f6");

    // 2) carrega settings do tenant e aplica overrides
    (async () => {
      try {
        const s = await supabaseGateway.getTenantSettings?.();
        const brand = (s?.brand_color || "").trim();
        if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(brand)) {
          set("--fix-primary", brand);
        }
        if (s?.logo_url) setBrandLogoUrl(String(s.logo_url));
        if (s?.brand_name) setBrandName(String(s.brand_name));
      } catch {
        // mantém defaults
      }
    })();
  }, []);

  return (
    <SessionProvider>
      {/* Overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="min-h-screen md:flex">
        {/* Sidebar: fixa no desktop, drawer no mobile */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Conteúdo */}
        <div className="flex min-h-screen flex-1 flex-col">
          {/* Header */}
          <header className="sticky top-0 z-30 border-b bg-white">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
              {/* Esquerda: hambúrguer (mobile) */}
              <div className="flex items-center gap-2">
                <button
                  className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded border"
                  aria-label="Abrir menu"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </button>
                {/* Nada de logo/nome no header; ficam no Sidebar */}
                <span className="sr-only">Painel</span>
              </div>

              {/* Direita: menu suspenso do usuário */}
              <UserMenu />
            </div>
          </header>

          {/* Main */}
          <main className="mx-auto w-full max-w-6xl flex-1 p-4">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
"use client";

import { useState, useEffect } from "react";
import { SessionProvider } from "@/contexts/SessionContext";
import Sidebar from "@/components/Sidebar";
import { supabaseGateway } from "@/lib/supabaseGateway";


export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [brandLogoUrl, setBrandLogoUrl] = useState("");
  const [brandName, setBrandName] = useState("Painel Fix v2");

  useEffect(() => {
  // 1) defaults seguros (caso as vars ainda não existam)
  const root = document.documentElement;
  const set = (k, v) => root.style.setProperty(k, v);

  // Defaults (ajuste se quiser outro tom neutro)
  set("--fix-primary", "#9b1237");       // vinho padrão (logo)
  set("--fix-surface", "#ffffff");       // fundo cards/shell
  set("--fix-border", "#e5e7eb");        // slate-200
  set("--fix-text", "#111827");          // slate-900
  set("--fix-text-muted", "#6b7280");    // slate-500
  set("--fix-hover", "#f3f4f6");         // slate-100

  // 2) carrega settings do tenant e aplica overrides
  (async () => {
    try {
     const s = await supabaseGateway.getTenantSettings?.();
     const brand = (s?.brand_color || "").trim(); // ok manter se você setar isso no futuro via settings
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(brand)) {
        set("--fix-primary", brand);
      }
      // NOVO: logo/nome
    if (s?.logo_url) setBrandLogoUrl(String(s.logo_url));
    if (s?.brand_name) setBrandName(String(s.brand_name));
  } catch {
    /* permanece com defaults */
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
          {/* Header simples com hambúrguer (mobile) */}
          <header className="sticky top-0 z-30 border-b bg-white">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded border"
                  aria-label="Abrir menu"
                  onClick={() => setSidebarOpen(true)}
                >
                  <span className="i-lucide-menu h-5 w-5" />
                </button>
                {brandLogoUrl ? (
                   <img
      src={brandLogoUrl}
      alt={brandName || "Logo"}
      className="h-7 md:h-8 w-auto max-h-8 md:max-h-9 object-contain"
      draggable={false}
    />
  ) : (
                <span className="font-semibold">{brandName}</span>
                )}
              </div>

              {/* Mock logout, como já estava */}
              <form action="/api/mock-logout" method="post">
                <button type="submit" className="text-sm underline">
                  Sair
                </button>
              </form>
            </div>
          </header>

          {/* Main */}
          <main className="mx-auto w-full max-w-6xl flex-1 p-4">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}

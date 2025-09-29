"use client";

import { useState } from "react";
import { SessionProvider } from "@/contexts/SessionContext";
import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
                <span className="font-semibold">Painel Fix v2</span>
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

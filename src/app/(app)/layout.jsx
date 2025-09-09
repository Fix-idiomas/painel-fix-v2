"use client";

import Tabs from "@/components/Tabs";
import { SessionProvider } from "@/contexts/SessionContext";

export default function AppLayout({ children }) {
  return (
    <SessionProvider>
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl flex-col px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <a href="/" className="font-semibold">Painel Fix v2</a>

            {/* Mock logout (opcional) */}
            <form action="/api/mock-logout" method="post">
              <button type="submit" className="text-sm underline">
                Sair
              </button>
            </form>
          </div>

          {/* Tabs + seletor de papéis (vem de <Tabs />) */}
          <div className="mt-3">
            <Tabs />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4">
        {children}
      </main>
    </SessionProvider>
  );
}

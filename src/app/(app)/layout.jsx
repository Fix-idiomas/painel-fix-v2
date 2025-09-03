"use client";

import Tabs from "@/components/Tabs";

export default function AppLayout({ children }) {
  return (
    <>
      <header className="px-4 py-3 border-b bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <a href="/" className="font-semibold">Painel Fix v2</a>
            <form action="/api/mock-logout" method="post">
              <button className="text-sm underline">Sair</button>
            </form>
          </div>
          <div className="mt-3"><Tabs /></div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4">{children}</main>
    </>
  );
}

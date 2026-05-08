// src/app/(app)/layout.jsx
"use client";

import { SessionProvider } from "@/contexts/SessionContext";
import AppShell from "@/components/AppShell";

export default function AppLayout({ children }) {
  return (
    <SessionProvider>
      <AppShell>
        {/* Wrapper de compatibilidade: páginas legadas (ainda não
            migradas do /preview) dependem desta caixa centralizada
            e do padding. Páginas migradas devem renderizar seu próprio
            container com max-w/padding e podem absorver/ignorar este. */}
        <div className="mx-auto w-full max-w-6xl p-4">{children}</div>
      </AppShell>
    </SessionProvider>
  );
}

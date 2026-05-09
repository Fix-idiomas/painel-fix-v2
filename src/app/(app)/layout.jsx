// src/app/(app)/layout.jsx
"use client";

import { SessionProvider } from "@/contexts/SessionContext";
import AppShell from "@/components/AppShell";

export default function AppLayout({ children }) {
  return (
    <SessionProvider>
      <AppShell>
        {/* Container central padrão para páginas do app (max-w + padding).
            Páginas que precisam de largura cheia podem usar negativos
            ou estruturar seu próprio layout. */}
        <div className="mx-auto w-full max-w-6xl p-4">{children}</div>
      </AppShell>
    </SessionProvider>
  );
}

// src/app/(app)/layout.jsx
"use client";

import { SessionProvider } from "@/contexts/SessionContext";
import AppShell from "@/components/AppShell";
import SubscriptionGuard from "@/components/SubscriptionGuard";

export default function AppLayout({ children }) {
  return (
    <SessionProvider>
      {/* Paywall: bloqueia o app sem assinatura ativa (libera /assinatura e /conta). */}
      <SubscriptionGuard>
        <AppShell>
          {/* Container central padrão para páginas do app (max-w + padding).
              Páginas que precisam de largura cheia podem usar negativos
              ou estruturar seu próprio layout. */}
          <div className="mx-auto w-full max-w-6xl p-4">{children}</div>
        </AppShell>
      </SubscriptionGuard>
    </SessionProvider>
  );
}

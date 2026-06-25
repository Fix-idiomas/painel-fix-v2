"use client";
// PRD-1 — Paywall. Bloqueia o app inteiro quando o tenant não tem entitlement
// (trial vencido / past_due / canceled / expired). Montado no layout do grupo
// (app), envolto pelo SessionProvider. Rotas de billing/conta ficam liberadas.
//
// Lê o status do claim "subscription" via useSubscription() — sem ida ao banco.
// É um gate de UI: o isolamento de DADOS continua garantido por RLS por tenant.

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSubscription, hasEntitlement } from "@/lib/subscription";
import { isAllowed } from "@/lib/paywallRoutes";

export default function SubscriptionGuard({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, subscription } = useSubscription();

  const entitled = hasEntitlement(subscription);
  const allowed = isAllowed(pathname);
  const blocked = !loading && !entitled && !allowed;

  useEffect(() => {
    if (blocked) router.replace("/assinatura");
  }, [blocked, router]);

  // Enquanto o claim carrega (ou durante o redirect do bloqueio), mostra um
  // fallback leve — nunca tela branca. O loading SEMPRE resolve (useSubscription
  // tem try/catch + timeout), então isto não fica preso.
  if (loading) return <GuardFallback label="Carregando…" />;
  if (blocked) return <GuardFallback label="Redirecionando…" />;

  return children;
}

function GuardFallback({ label }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">
      {label}
    </div>
  );
}

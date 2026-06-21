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

// Sempre acessível mesmo sem entitlement (auth e /onboarding já estão fora de (app)).
const ALLOWLIST = ["/assinatura", "/conta"];
const isAllowed = (pathname) =>
  ALLOWLIST.some((p) => pathname === p || pathname.startsWith(p + "/"));

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

  // Enquanto o claim carrega, não pisca conteúdo nem paywall.
  if (loading) return null;
  // Bloqueado: evita flash do conteúdo enquanto o redirect acontece.
  if (blocked) return null;

  return children;
}

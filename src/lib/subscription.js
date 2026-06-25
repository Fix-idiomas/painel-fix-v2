"use client";
// PRD-1 — Leitura do entitlement de assinatura a partir do claim "subscription"
// injetado no access token pelo auth hook (custom_access_token_hook).
// Lê do JWT decodificado (getClaims) — ZERO ida ao banco no hot path.

import { useEffect, useState } from "react";
import { supabase, getClaims } from "@/lib/supabaseClient";
import { hasEntitlement } from "@/lib/entitlement";

// Re-exporta a lógica pura (testada em entitlement.js) para manter os imports
// existentes (`import { hasEntitlement } from "@/lib/subscription"`).
export { hasEntitlement };

/** Lê o claim "subscription" do access token atual (ou null). */
export async function readSubscriptionClaim() {
  const claims = await getClaims();
  return claims?.subscription ?? null;
}

// Tempo máximo de espera pela leitura do claim antes de assumir estado seguro.
// Evita "loading" preso (e tela branca) se a leitura travar por sessão/timing.
const SUBSCRIPTION_READ_TIMEOUT_MS = 5000;

/**
 * Hook de assinatura para componentes client (guard, banners, página).
 * Re-lê o claim em mudanças de autenticação (login/refresh/logout).
 *
 * À prova de falha: `loading` SEMPRE resolve (try/catch + timeout). Em caso de
 * erro ou demora, assume `subscription = null` (estado seguro → o guard
 * redireciona em vez de ficar em branco).
 * @returns {{ loading: boolean, subscription: object|null }}
 */
export function useSubscription() {
  const [state, setState] = useState({ loading: true, subscription: null });

  useEffect(() => {
    let active = true;

    // Backstop: se nada resolver em N ms, sai do loading com estado seguro.
    const timeout = setTimeout(() => {
      if (active) setState((prev) => (prev.loading ? { loading: false, subscription: null } : prev));
    }, SUBSCRIPTION_READ_TIMEOUT_MS);

    async function load() {
      try {
        const sub = await readSubscriptionClaim();
        if (active) setState({ loading: false, subscription: sub });
      } catch {
        // Falha ao ler/decodificar o claim → trata como sem assinatura.
        if (active) setState({ loading: false, subscription: null });
      }
    }

    load();
    // IMPORTANTE: adiar para fora do callback. Chamar métodos do supabase.auth
    // (getSession via getClaims) DENTRO do onAuthStateChange disputa o lock do
    // token e causa deadlock no TOKEN_REFRESHED. setTimeout(0) libera o lock.
    const { data } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => { if (active) load(); }, 0);
    });

    return () => {
      active = false;
      clearTimeout(timeout);
      data?.subscription?.unsubscribe?.();
    };
  }, []);

  return state;
}

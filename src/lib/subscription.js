"use client";
// PRD-1 — Leitura do entitlement de assinatura a partir do claim "subscription"
// injetado no access token pelo auth hook (custom_access_token_hook).
// Lê do JWT decodificado (getClaims) — ZERO ida ao banco no hot path.

import { useEffect, useState } from "react";
import { supabase, getClaims } from "@/lib/supabaseClient";

/**
 * Decide se o tenant tem direito de acesso ao app.
 * Regra (PRD-1 RF-5/RF-7):
 *   - billing_exempt = true        → sempre liberado (isenção vitalícia)
 *   - status = 'active'            → liberado
 *   - status = 'trial' e não vencido → liberado (avaliado por data LOCAL)
 *   - caso contrário               → bloqueado
 * @param {{status?:string, billing_exempt?:boolean, trial_end?:string|null}|null} sub
 */
export function hasEntitlement(sub) {
  if (!sub) return false;
  if (sub.billing_exempt) return true;
  if (sub.status === "active") return true;
  if (sub.status === "trial") {
    if (!sub.trial_end) return true;
    return new Date(sub.trial_end).getTime() >= Date.now();
  }
  return false;
}

/** Lê o claim "subscription" do access token atual (ou null). */
export async function readSubscriptionClaim() {
  const claims = await getClaims();
  return claims?.subscription ?? null;
}

/**
 * Hook de assinatura para componentes client (guard, banners, página).
 * Re-lê o claim em mudanças de autenticação (login/refresh/logout).
 * @returns {{ loading: boolean, subscription: object|null }}
 */
export function useSubscription() {
  const [state, setState] = useState({ loading: true, subscription: null });

  useEffect(() => {
    let active = true;
    async function load() {
      const sub = await readSubscriptionClaim();
      if (active) setState({ loading: false, subscription: sub });
    }
    load();
    const { data } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      active = false;
      data?.subscription?.unsubscribe?.();
    };
  }, []);

  return state;
}

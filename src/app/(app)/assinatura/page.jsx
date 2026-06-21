"use client";
// PRD-1 — Página de assinatura / paywall (versão MÍNIMA).
// Mostra o estado atual do entitlement. O formulário de pagamento real
// (cartão via Asaas) e a gestão completa vêm no PRD-2/PRD-3.
// Esta rota está na ALLOWLIST do SubscriptionGuard (sempre acessível).

import { useMemo } from "react";
import { useSubscription, hasEntitlement } from "@/lib/subscription";

function diasRestantes(trialEnd) {
  if (!trialEnd) return null;
  const ms = new Date(trialEnd).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export default function AssinaturaPage() {
  const { loading, subscription } = useSubscription();
  const entitled = useMemo(() => hasEntitlement(subscription), [subscription]);

  if (loading) {
    return <div className="py-16 text-center text-slate-500">Carregando…</div>;
  }

  const status = subscription?.status ?? "desconhecido";
  const exempt = !!subscription?.billing_exempt;
  const dias = diasRestantes(subscription?.trial_end);

  return (
    <div className="mx-auto max-w-xl py-10">
      <h1 className="text-2xl font-semibold text-slate-900">Assinatura</h1>

      {exempt ? (
        <Banner tone="ok" title="Acesso de cortesia">
          Sua conta tem acesso vitalício liberado, sem cobrança.
        </Banner>
      ) : status === "trial" && entitled ? (
        <Banner tone="info" title="Período de avaliação">
          Você está no período de teste gratuito
          {dias != null ? ` — ${dias} dia(s) restante(s)` : ""}. Assine para
          manter o acesso quando o teste terminar.
        </Banner>
      ) : status === "active" ? (
        <Banner tone="ok" title="Assinatura ativa">
          Sua assinatura está ativa. Obrigado!
        </Banner>
      ) : status === "past_due" ? (
        <Banner tone="warn" title="Pagamento pendente">
          Não conseguimos confirmar o seu último pagamento. Regularize para
          reabrir o acesso.
        </Banner>
      ) : (
        <Banner tone="warn" title="Acesso bloqueado">
          Seu acesso está bloqueado ({status}). Assine para voltar a usar a
          plataforma.
        </Banner>
      )}

      {!exempt && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-600">
            O fluxo de pagamento (cartão de crédito recorrente via Asaas) será
            disponibilizado em breve. Por enquanto, fale com o administrador da
            plataforma para ativar sua assinatura.
          </p>
          <button
            type="button"
            disabled
            className="mt-4 cursor-not-allowed rounded-lg bg-slate-300 px-4 py-2 text-sm font-medium text-white"
            title="Disponível em breve"
          >
            Assinar agora (em breve)
          </button>
        </div>
      )}
    </div>
  );
}

function Banner({ tone = "info", title, children }) {
  const tones = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return (
    <div className={`mt-6 rounded-xl border p-4 ${tones[tone]}`}>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}

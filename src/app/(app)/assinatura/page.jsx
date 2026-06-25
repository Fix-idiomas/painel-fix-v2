"use client";
// PRD-3 — Página de assinatura / paywall. Cobre o entitlement tri-estado e
// inicia a assinatura na Asaas: CARTÃO via checkout hospedado (sem PAN/CVV na
// nossa UI, PCI SAQ-A) e PIX INLINE (QR + copia-e-cola no próprio app). Esta
// rota está na allowlist do guard.

import { useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useSubscription } from "@/lib/subscription";
import { accessLevel, trialDaysLeft } from "@/lib/entitlement";

const PRICE_LABEL = "R$ 49,90/mês"; // placeholder até a definição de preço

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR");
}

export default function AssinaturaPage() {
  const { loading, subscription } = useSubscription();
  const [method, setMethod] = useState("credit_card");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const [pix, setPix] = useState(null); // { encodedImage, payload, expirationDate }
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [checkedOnce, setCheckedOnce] = useState(false);
  const inputRef = useRef(null);

  const sub = subscription;
  const exempt = !!sub?.billing_exempt;
  const status = sub?.status ?? "desconhecido";
  const level = useMemo(() => accessLevel(sub), [sub]);
  const dias = trialDaysLeft(sub);

  async function startSubscription() {
    setError(null);
    const digits = cpfCnpj.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 14) {
      setError("Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, cpfCnpj: digits }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Não conseguimos iniciar a assinatura. Confira o CPF/CNPJ e tente de novo.");
        return;
      }
      // Pix: QR + copia-e-cola INLINE (sem sair do app).
      if (method === "pix" && data.pix?.payload && data.pix?.encodedImage) {
        setPix(data.pix);
        if (data.checkoutUrl) setCheckoutUrl(data.checkoutUrl); // fallback (sem auto-abrir)
      } else if (data.checkoutUrl) {
        // Cartão: checkout hospedado em nova aba.
        setCheckoutUrl(data.checkoutUrl);
        if (method === "credit_card") window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
      } else {
        setError("Assinatura criada, mas o pagamento ainda não está pronto. Aguarde alguns instantes e use “Já paguei — verificar”.");
      }
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function copyPix() {
    if (!pix?.payload) return;
    try {
      await navigator.clipboard.writeText(pix.payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar. Selecione e copie o código manualmente.");
    }
  }

  async function refresh() {
    setVerifying(true);
    setCheckedOnce(false);
    try {
      await supabase.auth.refreshSession();
    } catch {
      /* noop */
    } finally {
      // Se o status virar 'active', o componente re-renderiza para o estado
      // "ativo". Se NÃO virar, sinalizamos que a confirmação ainda não chegou.
      setTimeout(() => {
        setVerifying(false);
        setCheckedOnce(true);
      }, 1500);
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-slate-500">Carregando…</div>;
  }

  // Claim não carregou (erro de leitura/sessão) — não afirmar bloqueio.
  if (!sub) {
    return (
      <Page>
        <Banner tone="info" title="Não conseguimos verificar sua assinatura">
          Recarregue a página. Se persistir, saia e entre novamente.
        </Banner>
        <button type="button" onClick={() => location.reload()} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Recarregar
        </button>
      </Page>
    );
  }

  // Cortesia — sem cobrança
  if (exempt) {
    return (
      <Page>
        <Banner tone="ok" title="Acesso de cortesia">
          Sua conta tem acesso liberado, sem cobrança. Aproveite!
        </Banner>
      </Page>
    );
  }

  // Assinatura ativa
  if (status === "active") {
    return (
      <Page>
        <Banner tone="ok" title="Assinatura ativa">
          Obrigado! Sua assinatura está ativa
          {fmtDate(sub.current_period_end) ? ` — próxima cobrança em ${fmtDate(sub.current_period_end)}` : ""}.
        </Banner>
        <p className="mt-4 text-sm text-slate-600">
          Gerencie pagamento e cancelamento em <a className="text-sky-700 underline" href="/conta">Conta → Plano e cobrança</a>.
        </p>
      </Page>
    );
  }

  // Pix iniciado — QR + copia-e-cola INLINE (sem sair do app).
  if (pix) {
    return (
      <Page>
        <Banner tone="info" title={`Pague ${PRICE_LABEL.replace("/mês", "")} via Pix para liberar o acesso`}>
          Escaneie o QR Code ou copie o código abaixo no app do seu banco. Assim que a Asaas confirmar, seu acesso libera sozinho — costuma levar menos de 1 minuto.
        </Banner>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex justify-center">
            <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${pix.encodedImage}`}
                alt="QR Code Pix para pagamento"
                className="h-60 w-60"
              />
            </div>
          </div>

          <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="pixcode">Pix copia e cola</label>
          <div className="mt-1 flex gap-2">
            <input
              id="pixcode"
              readOnly
              value={pix.payload}
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.currentTarget.select()}
              className="w-full cursor-pointer truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-3 font-mono text-sm text-slate-700"
            />
            <button
              type="button"
              onClick={copyPix}
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg bg-sky-600 px-4 py-3 text-sm font-medium text-white hover:bg-sky-700"
            >
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
          <p className="mt-1 min-h-[1rem] text-xs text-sky-700" role="status" aria-live="assertive">
            {copied ? "Código copiado para a área de transferência." : ""}
          </p>
          <p className="text-xs text-slate-600">
            Cole no app do banco, na opção Pix copia e cola.
            {fmtDate(pix.expirationDate) ? ` Válido até ${fmtDate(pix.expirationDate)}.` : ""}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={refresh} disabled={verifying} className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              {verifying ? "Verificando…" : "Verificar pagamento"}
            </button>
            {checkoutUrl && (
              <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-sm font-medium text-sky-700 underline">
                Abrir página de pagamento
              </a>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-600" aria-live="polite">
            {verifying
              ? "Procurando a confirmação do pagamento…"
              : checkedOnce
                ? "Ainda não recebemos a confirmação. Aguarde alguns segundos e verifique de novo."
                : "Pode levar até 1 minuto após o pagamento."}
          </p>
        </div>
      </Page>
    );
  }

  // Pagamento iniciado (checkout aberto em outra aba)
  if (checkoutUrl) {
    return (
      <Page>
        <Banner tone="info" title="Conclua o pagamento">
          Conclua o pagamento na aba que abrimos. Assim que a Asaas confirmar, seu acesso libera sozinho — costuma levar menos de 1 minuto.
        </Banner>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800">
            Reabrir pagamento
          </a>
          <button type="button" onClick={refresh} disabled={verifying} className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {verifying ? "Verificando…" : "Verificar pagamento"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-600" aria-live="polite">
          {verifying
            ? "Procurando a confirmação do pagamento…"
            : checkedOnce
              ? "Ainda não recebemos a confirmação. Aguarde alguns segundos e verifique de novo."
              : "Pode levar até 1 minuto após o pagamento."}
        </p>
      </Page>
    );
  }

  // Estados que pedem assinatura/regularização
  const isPastDue = status === "past_due";
  const isReadonly = level === "readonly";
  const isInactive = status === "canceled" || status === "expired";
  const ctaLabel = isPastDue || isReadonly ? "Regularizar pagamento" : isInactive ? "Reativar assinatura" : status === "trial" ? "Assinar agora" : "Assinar";

  let headTone = "warn";
  let headTitle = "Assine para usar a plataforma";
  let headBody = `Plano único — ${PRICE_LABEL}.`;
  if (status === "trial") {
    headTone = "info";
    headTitle = "Período de teste";
    headBody = dias != null && dias >= 0
      ? `Você está no teste gratuito — ${dias} dia${dias === 1 ? "" : "s"} restante${dias === 1 ? "" : "s"}${fmtDate(sub.trial_end) ? ` (até ${fmtDate(sub.trial_end)})` : ""}. Assine para não perder o acesso.`
      : "Assine para manter o acesso quando o teste terminar.";
  } else if (isReadonly) {
    headTitle = "Acesso em modo leitura";
    headBody = "Você ainda vê e exporta seus dados, mas para voltar a operar é preciso regularizar o pagamento.";
  } else if (isPastDue) {
    headTone = "danger";
    headTitle = "Pagamento pendente";
    headBody = "Não conseguimos confirmar seu último pagamento. Regularize para reabrir o acesso.";
  } else if (status === "canceled") {
    headTone = "danger";
    headTitle = "Assinatura cancelada";
    headBody = `Seus dados continuam guardados. Reative quando quiser — plano único, ${PRICE_LABEL}.`;
  } else {
    headTone = "danger";
    headTitle = "Acesso bloqueado";
    headBody = `Seus dados estão guardados. Assine para voltar a usar — plano único, ${PRICE_LABEL}.`;
  }

  return (
    <Page>
      <Banner tone={headTone} title={headTitle}>{headBody}</Banner>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-2 text-sm font-medium text-slate-700">Forma de pagamento</p>
        <div className="flex gap-2">
          <MethodOption active={method === "credit_card"} onClick={() => setMethod("credit_card")} title="Cartão" hint="renova automático" />
          <MethodOption active={method === "pix"} onClick={() => setMethod("pix")} title="Pix" hint="sem renovação" />
        </div>

        <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="cpfcnpj">CPF ou CNPJ</label>
        <input
          id="cpfcnpj"
          ref={inputRef}
          inputMode="numeric"
          autoComplete="off"
          maxLength={18}
          value={cpfCnpj}
          onChange={(e) => setCpfCnpj(e.target.value)}
          placeholder="Somente números"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
        />
        <p className="mt-1 text-xs text-slate-600">Necessário para emitir a cobrança. CPF (pessoa) ou CNPJ (empresa).</p>

        {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}

        <button
          type="button"
          onClick={startSubscription}
          disabled={busy}
          className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-sky-600 px-4 py-3 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (method === "pix" ? "Gerando Pix…" : "Abrindo pagamento…") : ctaLabel}
        </button>
        <p className="mt-2 text-xs text-slate-600">Pagamento processado com segurança pela Asaas.</p>
      </div>
    </Page>
  );
}

function Page({ children }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <h1 className="text-2xl font-semibold text-slate-900">Assinatura</h1>
      {children}
    </div>
  );
}

function MethodOption({ active, onClick, title, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-lg border p-3 text-left ${active ? "border-sky-500 bg-sky-50 ring-1 ring-sky-200" : "border-slate-200 hover:border-slate-300"}`}
    >
      <div className="text-sm font-medium text-slate-800">{title}</div>
      <div className="text-xs text-slate-500">{hint}</div>
    </button>
  );
}

function Banner({ tone = "info", title, children }) {
  const tones = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={`mt-6 rounded-xl border p-4 ${tones[tone]}`}>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}

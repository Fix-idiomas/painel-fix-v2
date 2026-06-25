"use client";
// PRD-3 — Banner global de billing. Avisa (trial terminando, carência, atraso)
// ANTES do bloqueio. Fonte única: useSubscription + billingNotice (mesmo claim
// do guard). Dispensável na sessão; reaparece em novo login (estado some no reload).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useSubscription } from "@/lib/subscription";
import { billingNotice } from "@/lib/entitlement";

const TONES = {
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
};

export default function BillingBanner() {
  const router = useRouter();
  const { loading, subscription } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  if (loading || dismissed) return null;
  const notice = billingNotice(subscription);
  if (!notice) return null;

  return (
    <div
      role="region"
      aria-label="Aviso de cobrança"
      className={`flex items-center gap-3 border-b px-4 py-2 text-sm md:px-8 ${TONES[notice.tone]}`}
    >
      <span className="flex-1">{notice.text}</span>
      <button
        type="button"
        onClick={() => router.push(notice.href)}
        className="shrink-0 rounded-md border border-current/30 px-3 py-1.5 text-xs font-medium hover:bg-black/5 focus-visible:outline focus-visible:outline-2"
      >
        {notice.cta}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dispensar aviso"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded hover:bg-black/5 focus-visible:outline focus-visible:outline-2"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

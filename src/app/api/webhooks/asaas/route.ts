// src/app/api/webhooks/asaas/route.ts
//
// Recebe webhooks da Asaas e mantém public.subscriptions como fonte da verdade.
// - Auth: header `asaas-access-token` == ASAAS_WEBHOOK_TOKEN (verifyWebhook).
// - Idempotência: registra subscription_events.asaas_event_id (unique). Como as
//   transições são idempotentes (setam status), o padrão é check → processa →
//   registra; uma reentrega rara só reaplica o mesmo status (inócuo).
// - Mapeia evento → tenant via subscriptions (asaas_subscription_id, fallback
//   asaas_customer_id). NUNCA confia em tenant vindo do corpo.
// - Contas billing_exempt são auditadas mas NÃO rebaixadas.
// Service role (server-to-server, sem sessão). Sempre 2xx quando o evento foi
// recebido/registrado, para a Asaas não reenviar em loop.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyWebhook } from "@/lib/asaas";
import { transition, normalizeRef } from "@/lib/asaasWebhook";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Dict = Record<string, unknown>;

export async function POST(req: NextRequest) {
  if (!verifyWebhook(req)) {
    console.warn("[webhook:asaas] unauthorized", {
      hasToken: !!req.headers.get("asaas-access-token"),
    });
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("[webhook:asaas] misconfigured (service role ausente)");
    return NextResponse.json({ error: "Config ausente." }, { status: 500 });
  }

  let body: Dict;
  try {
    body = (await req.json()) as Dict;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const event = String(body?.event || "");
  const payment = (body?.payment as Dict) || null;
  const subObj = (body?.subscription as Dict) || null;
  // Asaas pode mandar subscription/customer como string (id) ou objeto expandido.
  const asaasSubId = normalizeRef(payment?.subscription) || normalizeRef(subObj?.id);
  const asaasCustId = normalizeRef(payment?.customer) || normalizeRef(subObj?.customer);
  const eventId =
    (body?.id as string) ||
    (payment?.id ? `${event}:${payment.id}` : null) ||
    (subObj?.id ? `${event}:${subObj.id}` : null);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1) Dedup: já processado? → ack
    if (eventId) {
      const { data: existing } = await supabase
        .from("subscription_events")
        .select("id")
        .eq("asaas_event_id", eventId)
        .maybeSingle();
      if (existing) {
        console.log("[webhook:asaas] duplicate, ack", { event, eventId });
        return NextResponse.json({ ok: true, duplicate: true });
      }
    }

    // 2) Resolve tenant via subscriptions (nunca pelo corpo)
    let row: { id: string; tenant_id: string; billing_exempt: boolean } | null =
      null;
    if (asaasSubId) {
      const { data } = await supabase
        .from("subscriptions")
        .select("id, tenant_id, billing_exempt")
        .eq("asaas_subscription_id", asaasSubId)
        .maybeSingle();
      row = data ?? null;
    }
    if (!row && asaasCustId) {
      const { data } = await supabase
        .from("subscriptions")
        .select("id, tenant_id, billing_exempt")
        .eq("asaas_customer_id", asaasCustId)
        .maybeSingle();
      row = data ?? null;
    }

    // 3) Aplica transição (idempotente). Isento = auditado, sem rebaixar.
    let applied = false;
    if (row && !row.billing_exempt) {
      const patch = transition(event, payment);
      if (patch) {
        const { error: upErr } = await supabase
          .from("subscriptions")
          .update(patch)
          .eq("id", row.id);
        if (upErr) throw upErr;
        applied = true;
      }
    }

    // 4) Registra o evento (auditoria + idempotência). Ignora violação de unique.
    if (eventId) {
      const { error: insErr } = await supabase.from("subscription_events").insert({
        tenant_id: row?.tenant_id ?? null,
        asaas_event_id: eventId,
        event_type: event,
        asaas_payment_id: (payment?.id as string) ?? null,
        asaas_subscription_id: asaasSubId,
        raw_payload: body,
      });
      if (insErr && insErr.code !== "23505") throw insErr;
    }

    console.log("[webhook:asaas] done", {
      event,
      tenant: row?.tenant_id ?? null,
      mapped: !!row,
      exempt: !!row?.billing_exempt,
      applied,
    });
    return NextResponse.json({ ok: true, mapped: !!row, applied });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[webhook:asaas] error", msg);
    // 500 → Asaas reenvia; o unique de asaas_event_id evita duplo processamento.
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

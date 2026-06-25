// src/lib/asaas.ts
// Cliente HTTP da Asaas (sandbox/produção). fetch-based, env-driven, SERVER-ONLY.
// Espelha o padrão de src/lib/mailgun.ts. NUNCA importar no browser (usa ASAAS_API_KEY).
//
// Env: ASAAS_BASE_URL (ex.: https://api-sandbox.asaas.com/v3), ASAAS_API_KEY,
//      ASAAS_WEBHOOK_TOKEN. Header de auth da API Asaas: { access_token: <key> }.

import crypto from "node:crypto";

const BASE_URL = process.env.ASAAS_BASE_URL;
const API_KEY = process.env.ASAAS_API_KEY;
const WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;

// Tipo "achatado" (campos opcionais) — narrowing de união discriminada não é
// confiável neste projeto (tsconfig strict:false / sem strictNullChecks).
export type AsaasResult<T> = {
  ok: boolean;
  data?: T;
  status?: number;
  error?: string;
};

type Json = Record<string, unknown>;

async function asaasFetch<T = Json>(
  path: string,
  init: RequestInit = {}
): Promise<AsaasResult<T>> {
  if (!BASE_URL || !API_KEY) {
    return { ok: false, status: 500, error: "Asaas não configurado (ASAAS_BASE_URL/ASAAS_API_KEY)." };
  }
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        access_token: API_KEY,
        ...(init.headers || {}),
      },
    });
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const b = body as { errors?: Array<{ description?: string }>; message?: string } | null;
    const msg = b?.errors?.[0]?.description || b?.message || `Asaas HTTP ${res.status}`;
    return { ok: false, status: res.status, error: String(msg) };
  }
  return { ok: true, data: body as T };
}

// ──────────────────────────── Customers ────────────────────────────
export interface CustomerInput {
  name: string;
  cpfCnpj: string; // CPF (pessoa física) ou CNPJ (pessoa jurídica) — a Asaas aceita ambos
  tenantId: string; // vira externalReference (1 customer por tenant)
  email?: string;
  mobilePhone?: string;
}

// Idempotente: procura por externalReference=tenantId; cria se não existir.
export async function getOrCreateCustomer(
  input: CustomerInput
): Promise<AsaasResult<{ id: string }>> {
  const found = await asaasFetch<{ data: Array<{ id: string }> }>(
    `/customers?externalReference=${encodeURIComponent(input.tenantId)}&limit=1`
  );
  if (found.ok && found.data?.data?.length) {
    return { ok: true, data: { id: found.data.data[0].id } };
  }

  const created = await asaasFetch<{ id: string }>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      cpfCnpj: input.cpfCnpj,
      email: input.email,
      mobilePhone: input.mobilePhone,
      externalReference: input.tenantId,
    }),
  });
  if (!created.ok) return created;
  return { ok: true, data: { id: created.data.id } };
}

// ────────────────────────── Subscriptions ──────────────────────────
export type AsaasMethod = "credit_card" | "pix";

const BILLING_TYPE: Record<AsaasMethod, string> = {
  credit_card: "CREDIT_CARD",
  pix: "PIX",
};

export interface SubscriptionInput {
  customerId: string;
  method: AsaasMethod;
  value: number;
  nextDueDate: string; // YYYY-MM-DD
  tenantId: string; // externalReference
  description?: string;
  creditCardToken?: string; // opcional: cartão já tokenizado (evita PAN no nosso backend)
}

export async function createSubscription(
  input: SubscriptionInput
): Promise<AsaasResult<{ id: string; status: string }>> {
  const payload: Json = {
    customer: input.customerId,
    billingType: BILLING_TYPE[input.method],
    value: input.value,
    nextDueDate: input.nextDueDate,
    cycle: "MONTHLY",
    description: input.description,
    externalReference: input.tenantId,
  };
  if (input.method === "credit_card" && input.creditCardToken) {
    payload.creditCardToken = input.creditCardToken;
  }
  return asaasFetch<{ id: string; status: string }>("/subscriptions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSubscription(id: string): Promise<AsaasResult<Json>> {
  return asaasFetch<Json>(`/subscriptions/${encodeURIComponent(id)}`);
}

export async function cancelSubscription(
  id: string
): Promise<AsaasResult<{ deleted: boolean; id: string }>> {
  return asaasFetch<{ deleted: boolean; id: string }>(
    `/subscriptions/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}

// ──────────────────────────── Webhook ──────────────────────────────
// Compara, em tempo constante, o header `asaas-access-token` com ASAAS_WEBHOOK_TOKEN.
export function verifyWebhook(req: Request): boolean {
  if (!WEBHOOK_TOKEN) return false;
  const got = req.headers.get("asaas-access-token") || "";
  const a = Buffer.from(got);
  const b = Buffer.from(WEBHOOK_TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

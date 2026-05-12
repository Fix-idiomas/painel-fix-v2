// src/app/api/admin/update-user-perms/route.ts
//
// NOTA: Apesar do path, o handler atual envia e-mails arbitrários via Mailgun.
// Era uma cópia duplicada de /api/send-mail. Refatorado para:
//   - usar o helper compartilhado sendMailgun (sem duplicar lógica de Mailgun)
//   - puxar o brand_name do tenant via Bearer token e usar como "from name"
//     (alias do remetente = nome do tenant)
//
// Autenticação: header Authorization: Bearer <supabase access token>.

import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendMailgun, type MailgunInput } from "@/lib/mailgun";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  try {
    // Auth via Bearer token
    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) return json({ error: "Não autenticado." }, 401);

    if (!URL || !ANON_KEY) {
      return json({ error: "Supabase não configurado." }, 500);
    }

    const pub = createClient(URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRes, error: uErr } = await pub.auth.getUser();
    if (uErr || !userRes?.user) {
      return json({ error: "Sessão inválida." }, 401);
    }

    // Body
    const body = (await req.json()) as MailgunInput;
    if (!body?.to || !body?.subject || (!body?.html && !body?.text)) {
      return json(
        { error: "Campos obrigatórios: to, subject e html ou text" },
        400
      );
    }

    // Alias = brand_name do tenant (cai pro default do Mailgun se vazio)
    let fromName: string | null = null;
    try {
      const { data: settings } = await pub.rpc("get_tenant_settings");
      const name = String(
        (settings as { brand_name?: string } | null)?.brand_name || ""
      ).trim();
      if (name) fromName = name;
    } catch {
      /* sem alias específico — usa default do Mailgun */
    }

    const result = await sendMailgun({ ...body, fromName });
    if (result.ok) {
      return json({ ok: true, id: result.id }, 200);
    }
    return json(
      { error: result.error ?? "Erro ao enviar e-mail." },
      result.status ?? 500
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
}

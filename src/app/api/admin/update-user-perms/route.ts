// src/app/api/admin/update-user-perms/route.ts
//
// POST { user_id, perms } — atualiza as permissões (user_claims.perms) de um
// membro do tenant atual. Chamado pelo modal "Editar permissões" em /conta.
//
// (Antes, este handler era uma cópia de /api/send-mail e enviava e-mail — o modal
// recebia 400 e nada era salvo.)
//
// Autenticação: Authorization: Bearer <supabase access token>.
// Autorização: is_admin_or_owner(current_tenant_id). A escrita usa o client do
// PRÓPRIO usuário (anon + token) → a RLS de user_claims (tenant_id =
// current_tenant_id() AND is_admin_or_members_write) continua valendo. Sem
// service role.
//
// Só as áreas editáveis na UI são alteradas; as demais chaves de perms (meta,
// reports, agenda, ...) são preservadas.

import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mergeEditablePerms } from "@/lib/permsPolicy";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return json({ error: "Não autenticado." }, 401);
    if (!URL || !ANON_KEY) return json({ error: "Supabase não configurado." }, 500);

    const pub = createClient(URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRes, error: uErr } = await pub.auth.getUser();
    if (uErr || !userRes?.user) return json({ error: "Sessão inválida." }, 401);

    const { data: tenantId, error: tErr } = await pub.rpc("current_tenant_id");
    if (tErr) throw tErr;
    if (!tenantId) return json({ error: "Tenant não identificado." }, 403);

    const { data: canManage, error: pErr } = await pub.rpc("is_admin_or_owner", { p_tenant: tenantId });
    if (pErr) throw pErr;
    if (!canManage) return json({ error: "Sem permissão para gerenciar usuários." }, 403);

    const body = (await req.json().catch(() => null)) as { user_id?: string; perms?: unknown } | null;
    const targetId = String(body?.user_id || "");
    if (!UUID_RE.test(targetId)) return json({ error: "Usuário inválido." }, 400);
    if (!body?.perms || typeof body.perms !== "object") {
      return json({ error: "Permissões inválidas." }, 400);
    }

    const { data: claim, error: cErr } = await pub
      .from("user_claims")
      .select("user_id, perms")
      .eq("tenant_id", tenantId)
      .eq("user_id", targetId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!claim) return json({ error: "Usuário não encontrado nesta escola." }, 404);

    const nextPerms = mergeEditablePerms(claim.perms, body.perms);

    const { data: updated, error: upErr } = await pub
      .from("user_claims")
      .update({ perms: nextPerms })
      .eq("tenant_id", tenantId)
      .eq("user_id", targetId)
      .select("user_id, perms");
    if (upErr) throw upErr;
    // RLS filtra em silêncio: 0 linhas = negado (não "sucesso vazio").
    if (!updated?.length) return json({ error: "Sem permissão para alterar este usuário." }, 403);

    return json({ ok: true, perms: updated[0].perms });
  } catch (e) {
    console.error("[admin:update-user-perms] error", e instanceof Error ? e.message : String(e));
    return json({ error: "Não foi possível salvar as permissões. Tente novamente." }, 500);
  }
}

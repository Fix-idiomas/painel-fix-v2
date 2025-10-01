// src/app/api/admin/update-user-perms/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function makeSupabase(accessToken) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE env vars ausentes.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function sanitizePerms(input) {
  const b = (v) => v === true; // força boolean
  const src = input && typeof input === "object" ? input : {};
  return {
    classes: {
      read:  b(src?.classes?.read),
      write: b(src?.classes?.write),
    },
    finance: {
      read:  b(src?.finance?.read),
      write: b(src?.finance?.write),
    },
    registry: {
      read:  b(src?.registry?.read),
      write: b(src?.registry?.write),
    },
  };
}

export async function POST(req) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Sem token de acesso." }, { status: 401 });
    }

    const supabase = makeSupabase(token);

    // valida entrada
    const body = await req.json().catch(() => ({}));
    const user_id = String(body?.user_id || "").trim();
    const perms   = sanitizePerms(body?.perms);

    if (!user_id) {
      return NextResponse.json({ error: "user_id é obrigatório." }, { status: 400 });
    }

    // autentica chamador
    const { data: me, error: meErr } = await supabase.auth.getUser();
    if (meErr || !me?.user) {
      return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
    }

    // tenant atual do chamador
    const { data: tenantId, error: tErr } = await supabase.rpc("current_tenant_id");
    if (tErr || !tenantId) {
      return NextResponse.json({ error: "Falha ao resolver tenant do usuário." }, { status: 400 });
    }

    // autorização: só quem pode gerenciar usuários
    const { data: canManage, error: pErr } = await supabase.rpc("can_manage_users");
    if (pErr || !canManage) {
      return NextResponse.json({ error: "Sem permissão para gerenciar usuários." }, { status: 403 });
    }

    // garante que o alvo pertence ao mesmo tenant
    const { data: targetRows, error: qErr } = await supabase
      .from("user_claims")
      .select("user_id, tenant_id")
      .eq("tenant_id", tenantId)
      .eq("user_id", user_id)
      .limit(1);

    if (qErr) {
      return NextResponse.json({ error: qErr.message }, { status: 500 });
    }
    if (!targetRows?.length) {
      return NextResponse.json({ error: "Usuário alvo não pertence a este tenant." }, { status: 404 });
    }

    // aplica atualização das permissões (jsonb)
    const { error: upErr } = await supabase
      .from("user_claims")
      .update({ perms })
      .eq("tenant_id", tenantId)
      .eq("user_id", user_id);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: "perms_updated" });
  } catch (e) {
    return NextResponse.json({ error: e?.message || "Erro inesperado." }, { status: 500 });
  }
}
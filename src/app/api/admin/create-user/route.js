// src/app/api/admin/create-user/route.js
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Client com service role (admin) para operações no Auth e consultas server-side
const admin = createClient(URL, SERVICE_KEY);

// Recupera o chamador (via token Bearer) e um client "pub" que respeita RLS
async function getCaller(req) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) throw { status: 401, message: "Não autenticado." };

  const pub = createClient(URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await pub.auth.getUser();
  if (error || !data?.user) throw { status: 401, message: "Sessão inválida." };
  return { user: data.user, pub };
}

function sanitizeIdentification(s) {
  if (typeof s !== "string") return "";
  let out = s.trim().replace(/[<>]/g, "");
  if (out.length > 40) out = out.slice(0, 40);
  return out;
}

// Procura um usuário existente no Auth pelo e-mail (paginado)
async function findUserIdByEmail(email) {
  let page = 1;
  const perPage = 200;
  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) break;
    const found = data?.users?.find(
      (u) => u.email?.toLowerCase() === String(email).toLowerCase()
    );
    if (found) return found.id;
    if (!data || (data.users?.length ?? 0) < perPage) break;
    page += 1;
  }
  return null;
}

export async function POST(req) {
  try {
    const { user: caller, pub } = await getCaller(req);

    const body = await req.json().catch(() => ({}));
    const { email, password, name, phone, cpf, perms } = body || {};
    let { role } = body || {};

    const permsObj = perms && typeof perms === "object" ? { ...perms } : {};
    const systemRole = (String(role).toLowerCase() === "admin") ? "admin" : "user";

    // Guarda rótulo livre em perms.meta.label (até existir coluna própria)
    if (role && typeof role === "string" && role.toLowerCase() !== "admin") {
      permsObj.meta ??= {};
      permsObj.meta.label = role;
    }

    if (!email || !password) return NextResponse.json({ error: "Email e senha são obrigatórios." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Senha deve ter ao menos 8 caracteres." }, { status: 400 });

    role = sanitizeIdentification(role);
    if (!role || role.length < 3) {
      return NextResponse.json(
        { error: "Informe uma identificação válida (ex.: teacher B, adm Bruno)." },
        { status: 400 }
      );
    }

    // Valida que o chamador controla este tenant
  // **Resolver tenant_id no server, a partir do chamador (owner/admin)**
let tenant_id_server = null;
// 1) Owner?
{
  const { data: owned, error: ownErr } = await pub
    .from("tenants")
    .select("id")
    .eq("owner_user_id", caller.id)
    .limit(1);
  if (ownErr) return NextResponse.json({ error: ownErr.message || "Falha ao identificar tenant (owner)." }, { status: 500 });
  if (owned?.[0]) tenant_id_server = owned[0].id;
}
// 2) Se não for owner, admin via claim
if (!tenant_id_server) {
  const { data: adminClaim, error: claimErr } = await pub
    .from("user_claims")
    .select("tenant_id")
    .eq("user_id", caller.id)
    .eq("role", "admin")
    .limit(1);
  if (claimErr) return NextResponse.json({ error: claimErr.message || "Falha ao identificar tenant (admin)." }, { status: 500 });
  if (adminClaim?.[0]) tenant_id_server = adminClaim[0].tenant_id;
}
if (!tenant_id_server) {
  return NextResponse.json({ error: "Sem tenant associado ao chamador (owner/admin)." }, { status: 403 });
}
    // Cria no Auth
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, phone, cpf },
    });

    // Usuário novo → insere claim com snapshots
    if (!createErr && created?.user?.id) {
      const newUserId = created.user.id;

      const { error: insertErr } = await admin
        .from("user_claims")
        .insert([{
          user_id: newUserId,
          role: systemRole,
          tenant_id: tenant_id_server,
          perms: permsObj,
         // snapshots corretos: nome no 'name', email no 'email'
          user_name_snapshot: (name && name.trim()) || null,
          user_email_snapshot: email,
        }]);

      if (insertErr) {
        return NextResponse.json(
          { error: "Usuário criado, mas falha ao registrar permissões.", detail: insertErr.message, code: insertErr.code },
          { status: 207 }
        );
      }

      return NextResponse.json({ userId: newUserId, status: "created_and_confirmed" }, { status: 201 });
    }

    // E-mail já existe → bloqueia reuso (política rígida)
    const msg = (createErr?.message || "").toLowerCase();
    if (createErr?.status === 422 && msg.includes("already been registered")) {
      const existingUserId = await findUserIdByEmail(email);
      if (!existingUserId) {
        return NextResponse.json(
          { error: "E-mail já cadastrado, mas não foi possível localizar o usuário." },
          { status: 500 }
        );
      }

      const { data: existingClaims, error: claimsErr } = await admin
        .from("user_claims")
        .select("tenant_id")
        .eq("user_id", existingUserId);

      if (claimsErr) {
        return NextResponse.json({ error: "Falha ao checar vínculos do usuário." }, { status: 500 });
      }

      const isAlreadyMemberHere = (existingClaims || []).some(r => r.tenant_id === tenant_id);
      if (isAlreadyMemberHere) {
        return NextResponse.json({ userId: existingUserId, status: "already_member" }, { status: 200 });
      }

      return NextResponse.json(
        { error: "Este e-mail já está registrado na plataforma. Use outro e-mail." },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Falha ao criar usuário no Auth." }, { status: 500 });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Erro inesperado." },
      { status: err?.status || 500 }
    );
  }
}

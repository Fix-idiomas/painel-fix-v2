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
  // supabase-js v2: listUsers({ page, perPage })
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
    // 1) Quem chama
    const { user: caller, pub } = await getCaller(req);

    // 2) Entrada
    const body = await req.json().catch(() => ({}));
const { email, password, name, phone, cpf, tenant_id, perms } = body || {};
  let { role } = body || {};
  // Inicializa permsObj a partir de perms ou como objeto vazio
  const permsObj = perms && typeof perms === 'object' ? { ...perms } : {};
  // Coerção pétrea: schema exige 'admin' | 'user'
  const systemRole = (String(role).toLowerCase() === 'admin') ? 'admin' : 'user';
  // Opcional: guardar o rótulo livre dentro de perms até criarmos coluna 'label'
  if (role && typeof role === 'string' && role.toLowerCase() !== 'admin') {
    // mantém rótulo do front como identificação livre
    permsObj.meta ??= {};
    permsObj.meta.label = role;
  }

    if (!tenant_id) {
      return NextResponse.json({ error: "tenant_id é obrigatório." }, { status: 400 });
    }
    if (!email || !password) {
      return NextResponse.json({ error: "Email e senha são obrigatórios." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Senha deve ter ao menos 8 caracteres." }, { status: 400 });
    }

    role = sanitizeIdentification(role);
    if (!role || role.length < 3) {
      return NextResponse.json(
        { error: "Informe uma identificação válida (ex.: teacher B, adm Bruno)." },
        { status: 400 }
      );
    }

    // 3) Validar que o chamador controla este tenant:
    //    (a) é owner do tenant OU (b) já tem claim 'admin' nesse tenant
    const { data: ownerRow } = await pub
      .from("tenants")
      .select("id")
      .eq("id", tenant_id)
      .eq("owner_user_id", caller.id)
      .limit(1);

    let callerOk = !!ownerRow?.[0];

    if (!callerOk) {
      const { data: adminClaim } = await pub
        .from("user_claims")
        .select("user_id")
        .eq("tenant_id", tenant_id)
        .eq("user_id", caller.id)
        .eq("role", "admin")
        .limit(1);
      callerOk = !!adminClaim?.[0];
    }

    if (!callerOk) {
      return NextResponse.json({ error: "Acesso negado para este tenant." }, { status: 403 });
    }

    // 4) Tentar criar no Auth (política rígida: sem app_metadata; governança via user_claims)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, phone, cpf },
      // ❗ NÃO definir app_metadata (evita sobrescrever tenant anterior)
    });

    // 4.a) Usuário novo criado → inserir claim com tenant_id explícito
    if (!createErr && created?.user?.id) {
      const newUserId = created.user.id;

       // ⬇️ Usa SERVICE ROLE para não depender de RLS (já validamos owner/admin acima)
      const { error: insertErr } = await admin
        .from("user_claims")
        .insert([{ user_id: newUserId, role: systemRole, tenant_id, perms: permsObj }]);

      if (insertErr) {
        return NextResponse.json(
           { error: "Usuário criado, mas falha ao registrar permissões.", detail: insertErr.message, code: insertErr.code },
          { status: 207 }
        );
      }

      return NextResponse.json(
        { userId: newUserId, status: "created_and_confirmed" },
        { status: 201 }
      );
    }

    // 5) E-mail já cadastrado no Auth → política rígida (bloqueia reuso)
    const msg = (createErr?.message || "").toLowerCase();
    if (createErr?.status === 422 && msg.includes("already been registered")) {
      const existingUserId = await findUserIdByEmail(email);
      if (!existingUserId) {
        return NextResponse.json(
          { error: "E-mail já cadastrado, mas não foi possível localizar o usuário." },
          { status: 500 }
        );
      }

      // Verifica se já é membro DESTE tenant (idempotência)
      const { data: existingClaims, error: claimsErr } = await admin
        .from("user_claims")
        .select("tenant_id")
        .eq("user_id", existingUserId);

      if (claimsErr) {
        return NextResponse.json(
          { error: "Falha ao checar vínculos do usuário." },
          { status: 500 }
        );
      }

      const isAlreadyMemberHere = (existingClaims || []).some(
        (r) => r.tenant_id === tenant_id
      );

      if (isAlreadyMemberHere) {
        return NextResponse.json(
          { userId: existingUserId, status: "already_member" },
          { status: 200 }
        );
      }

      // ✅ Política rígida: não permitir reuso de e-mail já existente no Auth
      return NextResponse.json(
        { error: "Este e-mail já está registrado na plataforma. Use outro e-mail." },
        { status: 409 }
      );
    }

    // 6) Outro erro do Auth
    return NextResponse.json(
      { error: "Falha ao criar usuário no Auth." },
      { status: 500 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Erro inesperado." },
      { status: err?.status || 500 }
    );
  }
}

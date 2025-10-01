// src/app/(app)/conta/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

export default function MinhaContaPage() {
  const [loading, setLoading] = useState(true);

  const [user, setUser]         = useState(null);
  const [claim, setClaim]       = useState(null);  // claim do usuário atual (tenant_id, role)
  const [tenant, setTenant]     = useState(null);  // dados do tenant
  const [members, setMembers]   = useState([]);    // membros do tenant (com display_name/email)
  const [membersError, setMembersError] = useState(null);

  const [editTarget, setEditTarget]   = useState(null);   // membro selecionado
  const [editPerms, setEditPerms]     = useState(null);   // json de perms em edição
  const [savingEdit, setSavingEdit]   = useState(false);
  const [editMsg, setEditMsg]         = useState(null);


  // 🔒 pode gerenciar usuários? (RPC no Postgres)
  const [canManageUsers, setCanManageUsers] = useState(false);

  // modal/cadastro
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", cpf: "", password: "", role: "",
  });

  // 🔐 Permissões padrão para novo usuário
  const [perms, setPerms] = useState({
    classes:  { read: true,  write: false },
    finance:  { read: false, write: false },
    registry: { read: false, write: false },
  });

  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState(null);

  // helpers UI
  function togglePerm(path) {
    setPerms(prev => {
      const [area, key] = path.split(".");
      const areaObj = prev?.[area] ?? { read: false, write: false };
      return { ...prev, [area]: { ...areaObj, [key]: !areaObj[key] } };
    });
  }
  function onChangeField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const isOwner   = useMemo(() => tenant?.owner_user_id === user?.id, [tenant, user]);
  const isAdminUI = useMemo(() => isOwner || claim?.role === "admin", [isOwner, claim]);

  // --------- Carregar membros (user_claims) ----------
  async function loadMembersByTenantId(tenantId) {
    const msg = (e) =>
      e?.message || e?.hint || e?.details || e?.code || "Falha ao carregar membros.";

    setMembersError(null);

    const { data, error } = await supabase
      .from("user_claims")
      .select("user_id, role, perms, created_at, user_name_snapshot, user_email_snapshot")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("user_claims fetch failed:", error);
      setMembers([]);
      setMembersError(msg(error));
      return;
    }

    const rows = (data ?? []).map((c) => ({
      ...c,
      display_name:  c.user_name_snapshot  || c.user_email_snapshot || c.user_id,
      display_email: c.user_email_snapshot || null,
    }));

    setMembers(rows);
  }
  function openEditPerms(m) {
  // defaults seguros para todas as áreas conhecidas
  const safe = {
    classes:  { read: false, write: false },
    finance:  { read: false, write: false },
    registry: { read: false, write: false },
  };
  const merged = {
    ...safe,
    ...(m?.perms || {}),
    classes:  { ...safe.classes,  ...(m?.perms?.classes  || {}) },
    finance:  { ...safe.finance,  ...(m?.perms?.finance  || {}) },
    registry: { ...safe.registry, ...(m?.perms?.registry || {}) },
  };
  setEditTarget(m);
  setEditPerms(merged);
  setEditMsg(null);
}

function toggleEdit(path) {
  setEditPerms(prev => {
    const [area, key] = path.split(".");
    const areaObj = prev?.[area] ?? { read: false, write: false };
    return { ...prev, [area]: { ...areaObj, [key]: !areaObj[key] } };
  });
}

async function saveEditPerms() {
  try {
    setSavingEdit(true);
    setEditMsg(null);

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) { setEditMsg("Sessão inválida."); return; }

    // chama a rota (próximo passo eu te envio a implementação do /api/admin/update-user-perms)
    const res = await fetch("/api/admin/update-user-perms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        user_id: editTarget?.user_id,
        perms: editPerms,
      }),
    });

    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEditMsg(out?.error || "Falha ao salvar permissões.");
      return;
    }

    setEditMsg("Permissões atualizadas.");
    // Atualiza listagem
    await refreshMembers(tenant?.id ?? claim?.tenant_id);
    // fecha depois de um pequeno delay
    setTimeout(() => {
      setEditTarget(null);
      setEditPerms(null);
      setEditMsg(null);
    }, 600);
  } finally {
    setSavingEdit(false);
  }
}

  // --------- Boot / Sessão ----------
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: { user: u }, error: uErr } = await supabase.auth.getUser();
        if (uErr || !u) {
          if (typeof window !== "undefined") {
            localStorage.setItem(
              "postLoginRedirect",
              window.location.pathname + window.location.search
            );
            window.location.href = "/login";
          }
          return;
        }
        setUser(u);

        // 1) Proprietário?
        const { data: owned } = await supabase
          .from("tenants")
          .select("id, name, created_at, owner_user_id")
          .eq("owner_user_id", u.id)
          .limit(1);

        if (owned?.[0]) {
          const t = owned[0];
          setTenant(t);
          setClaim({ tenant_id: t.id, role: "admin" }); // owner como admin na UX
          await loadMembersByTenantId(t.id);

          // verificação de permissão
          const { data: canMU } = await supabase.rpc("can_manage_users");
          setCanManageUsers(!!canMU);
          return;
        }

        // 2) Senão, via claim do usuário
        const { data: myClaims } = await supabase
          .from("user_claims")
          .select("tenant_id, role")
          .eq("user_id", u.id)
          .limit(1);

        if (!myClaims?.length) {
          setClaim(null); // sem tenant
          return;
        }

        const myClaim = myClaims[0];
        setClaim(myClaim);

        const { data: tenants } = await supabase
          .from("tenants")
          .select("id, name, created_at, owner_user_id")
          .eq("id", myClaim.tenant_id)
          .limit(1);

        if (tenants?.[0]) setTenant(tenants[0]);

        await loadMembersByTenantId(myClaim.tenant_id);

        // verificação de permissão
        const { data: canMU } = await supabase.rpc("can_manage_users");
        setCanManageUsers(!!canMU);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // --------- Refresh após cadastro ----------
  async function refreshMembers(tenantId) {
    if (!tenantId) return;
    await loadMembersByTenantId(tenantId);
  }

  // --------- Cadastrar usuário ----------
  async function handleCreateUser(e) {
    e?.preventDefault?.();
    setCreateMsg(null);

    if (!canManageUsers) {
      setCreateMsg("Você não tem permissão para cadastrar usuários.");
      return;
    }
    if (!form.email) { setCreateMsg("Informe um e-mail."); return; }
    if (!form.password || form.password.length < 8) { setCreateMsg("Senha precisa ter ao menos 8 caracteres."); return; }
    if (!form.role || form.role.trim().length < 3) { setCreateMsg("Informe uma identificação (ex.: teacher B, adm Bruno)."); return; }

    try {
      setCreating(true);

      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      const tenant_id = tenant?.id ?? claim?.tenant_id;

      if (!accessToken) { setCreateMsg("Sessão inválida. Faça login novamente."); return; }
      if (!tenant_id)   { setCreateMsg("Tenant inválido na sessão."); return; }

      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email:    form.email,
          password: form.password,
          name:     form.name,
          phone:    form.phone,
          cpf:      form.cpf,
          role:     form.role,
          tenant_id,
          perms, // <- inclui classes/finance/registry
        }),
      });

      const out = await res.json();

      if (!res.ok) {
        if (res.status === 409) setCreateMsg("Este e-mail já está vinculado a outra escola. Use outro e-mail.");
        else setCreateMsg(out?.error || "Falha ao criar usuário.");
        return;
      }

      if (out?.status === "already_member")              setCreateMsg("Usuário já é membro desta escola.");
      else if (out?.status === "linked_existing")        setCreateMsg("Usuário já existia. Vinculado a esta escola com sucesso.");
      else if (out?.status === "created_and_confirmed")  setCreateMsg("Usuário criado com sucesso.");
      else                                               setCreateMsg("Operação concluída.");

      await refreshMembers(tenant_id);

      setTimeout(() => {
        setShowCreateModal(false);
        setForm({ name: "", email: "", phone: "", cpf: "", password: "", role: "" });
        setPerms({
          classes:  { read: true,  write: false },
          finance:  { read: false, write: false },
          registry: { read: false, write: false },
        });
        setCreateMsg(null);
      }, 800);
    } finally {
      setCreating(false);
    }
  }

  // --------- Render ----------
  if (loading) return <div className="p-6">Carregando…</div>;

  if (!claim && !isOwner) {
    return (
      <div className="mx-auto max-w-md p-6 text-center space-y-4">
        <p>Você ainda não possui acesso a um tenant.</p>
        <Link href="/login" className="underline">Entrar</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Minha Conta</h1>
        <span className="text-sm opacity-70">
          Você: <code>{user?.email}</code> • Role: <strong>{isOwner ? "admin (owner)" : claim?.role}</strong>
        </span>
      </header>

      {isOwner && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm mb-4">
          <div className="font-medium">🎛️ Você é o responsável pela conta</div>
          <div className="opacity-75">Como proprietário do tenant, você controla preferências e cobrança.</div>
        </div>
      )}

      {/* Dados do Tenant */}
      <section className="rounded-2xl border p-5 space-y-2">
        <h2 className="text-lg font-medium">Dados do Tenant</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div><span className="opacity-70">Tenant ID:</span> <code>{tenant?.id || claim?.tenant_id}</code></div>
          <div><span className="opacity-70">Nome:</span> {tenant?.name || "-"}</div>
          <div><span className="opacity-70">Criado em:</span> {tenant?.created_at ? new Date(tenant.created_at).toLocaleString("pt-BR") : "-"}</div>
        </div>
      </section>

      {/* Custos (placeholder) */}
      <section className="rounded-2xl border p-5 space-y-2">
        <h2 className="text-lg font-medium">Custos</h2>
        <p className="text-sm opacity-70">Em breve: plano, valor mensal, próximos vencimentos e consumo.</p>
      </section>

      {/* Área do Proprietário / Admin */}
      {isAdminUI && (
        <section className="rounded-2xl border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Área do Proprietário</h2>
            {!isOwner && <span className="text-xs opacity-70">Visível para admin</span>}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Equipe / Usuários</h3>
            <div className="flex items-center justify-between">
              <p className="text-sm opacity-80">
                Cadastrar membros do tenant com permissões definidas por você.
              </p>

              {/* Botão só se puder gerenciar usuários */}
              {canManageUsers && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50"
                >
                  + Cadastrar Usuário
                </button>
              )}
            </div>
          </div>

          {/* Preferências / Cobrança shortcuts */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Preferências do Tenant</h3>
              <Link
                href="/configuracoes"
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50"
                title="Abrir Configurações"
              >
                Abrir Configurações
              </Link>
            </div>
            <p className="text-sm text-neutral-600">
              Gerencie logo, nome da marca, layout de navegação e tema.
            </p>
          </div>

          {/* Membros */}
          <div className="pt-2">
            <h3 className="text-sm font-medium mb-2">Membros</h3>

            {membersError && (
              <div className="p-3 mb-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded">
                {membersError}
              </div>
            )}

            <div className="text-sm rounded border divide-y">
              {members.length === 0 && !membersError && (
                <div className="p-2 opacity-70">Sem membros cadastrados.</div>
              )}
              

              {members.map((m) => (
                <div
                  key={`${m.user_id}-${m.role}-${m.created_at}`}
                  className="p-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                >
                  <div className="min-w-0" title={m.user_id}>
                    <div className="font-medium truncate">
                      {m.display_name || m.user_id}
                    </div>
                    {m.display_email && (
                      <div className="text-xs text-slate-500 truncate">
                        {m.display_email}
                      </div>
                    )}
                    <div className="opacity-70 text-xs">
                      Criado: {new Date(m.created_at).toLocaleString("pt-BR")}
                    </div>
                    {m.perms && (
                      <div className="opacity-70 text-[11px] mt-1">
                        {m.perms?.classes?.read   ? "Turmas:R"        : ""}
                        {m.perms?.classes?.write  ? " W"              : ""}
                        {m.perms?.finance?.read   ? " • Financeiro:R" : ""}
                        {m.perms?.finance?.write  ? " W"              : ""}
                        {m.perms?.registry?.read  ? " • Cadastros:R"  : ""}
                        {m.perms?.registry?.write ? " W"              : ""}
                      </div>
                    )}
                    
                  </div>
                  {/* ⬇️ Dentro do map dos membros (onde você exibe cada `m`), adicione o botão Editar */}
<div className="shrink-0 flex items-center gap-2">
  <span className="px-2 py-1 rounded bg-gray-100 text-xs">{m.role || "-"}</span>

  {/* Botão editar permissões — opcionalmente só mostre se canManageUsers === true */}
  {canManageUsers && (
    <button
      type="button"
      onClick={() => openEditPerms(m)}
      className="rounded border px-2 py-1 text-xs hover:bg-neutral-50"
      title="Editar permissões"
    >
      Editar permissões
    </button>
  )}
</div>

                  <div className="shrink-0">
                    <span className="px-2 py-1 rounded bg-gray-100 text-xs">
                      {m.role || "-"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Modal de cadastro — só aparece se tiver permissão */}
          {canManageUsers && showCreateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
                <div className="mb-4">
                  <h4 className="text-lg font-semibold">Cadastrar Usuário</h4>
                  <p className="text-sm text-neutral-600">
                    Preencha os dados do novo usuário. O e-mail será confirmado automaticamente e a senha inicial é definida por você.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Nome</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => onChangeField("name", e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                      placeholder="Nome completo"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">E-mail</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => onChangeField("email", e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                      placeholder="email@exemplo.com"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Telefone</label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => onChangeField("phone", e.target.value)}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                        placeholder="(00) 00000-0000"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">CPF</label>
                      <input
                        type="text"
                        value={form.cpf}
                        onChange={(e) => onChangeField("cpf", e.target.value)}
                        className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                        placeholder="000.000.000-00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Senha inicial</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => onChangeField("password", e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                      placeholder="Defina a senha de acesso"
                    />
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Mínimo 8 caracteres. O usuário poderá alterá-la depois.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Identificação</label>
                    <input
                      type="text"
                      value={form.role}
                      onChange={(e) => onChangeField("role", e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                      placeholder='ex.: "teacher B", "adm Bruno"'
                    />
                  </div>

                  {/* Permissões */}
                  <div className="mt-2 border-t pt-3">
                    <div className="text-sm font-medium mb-2">Permissões</div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div className="rounded-lg border p-3">
                        <div className="font-medium mb-1">Turmas</div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!perms.classes?.read}
                            onChange={() => togglePerm("classes.read")}
                          />
                          Leitura
                        </label>
                        <label className="flex items-center gap-2 mt-1">
                          <input
                            type="checkbox"
                            checked={!!perms.classes?.write}
                            onChange={() => togglePerm("classes.write")}
                          />
                          Edição
                        </label>
                      </div>

                      <div className="rounded-lg border p-3">
                        <div className="font-medium mb-1">Financeiro</div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!perms.finance?.read}
                            onChange={() => togglePerm("finance.read")}
                          />
                          Leitura
                        </label>
                        <label className="flex items-center gap-2 mt-1">
                          <input
                            type="checkbox"
                            checked={!!perms.finance?.write}
                            onChange={() => togglePerm("finance.write")}
                          />
                          Edição
                        </label>
                      </div>

                      {/* Cadastros */}
                      <div className="rounded-lg border p-3">
                        <div className="font-medium mb-1">Cadastros</div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!perms.registry?.read}
                            onChange={() => togglePerm("registry.read")}
                          />
                          Leitura
                        </label>
                        <label className="flex items-center gap-2 mt-1">
                          <input
                            type="checkbox"
                            checked={!!perms.registry?.write}
                            onChange={() => togglePerm("registry.write")}
                          />
                          Edição
                        </label>
                      </div>
                    </div>

                    <p className="text-xs text-neutral-500 mt-2">
                      Você pode ajustar depois. Essas permissões afetam o que o usuário enxerga/edita no app.
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    className="rounded-lg border px-3 py-2 text-sm"
                    onClick={() => setShowCreateModal(false)}
                    disabled={creating}
                  >
                    Cancelar
                  </button>
                  <button
                    className="rounded-lg border px-3 py-2 text-sm"
                    onClick={handleCreateUser}
                    disabled={creating}
                    title="Criar usuário"
                  >
                    {creating ? "Cadastrando..." : "Cadastrar"}
                  </button>
                </div>

                {createMsg && <div className="mt-3 text-sm">{createMsg}</div>}
              </div>
            </div>
          )}
        </section>
      )}
{/* ⬇️ Modal de Edição — coloque no final do JSX (perto do modal de cadastro) */}
{editTarget && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
      <div className="mb-4">
        <h4 className="text-lg font-semibold">Editar permissões</h4>
        <p className="text-sm text-neutral-600">
          Ajuste as permissões de <b>{editTarget.display_name || editTarget.display_email || editTarget.user_id}</b>.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg border p-3">
          <div className="font-medium mb-1">Turmas</div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!editPerms?.classes?.read}
              onChange={() => toggleEdit("classes.read")}
            />
            Leitura
          </label>
          <label className="flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              checked={!!editPerms?.classes?.write}
              onChange={() => toggleEdit("classes.write")}
            />
            Edição
          </label>
        </div>

        <div className="rounded-lg border p-3">
          <div className="font-medium mb-1">Financeiro</div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!editPerms?.finance?.read}
              onChange={() => toggleEdit("finance.read")}
            />
            Leitura
          </label>
          <label className="flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              checked={!!editPerms?.finance?.write}
              onChange={() => toggleEdit("finance.write")}
            />
            Edição
          </label>
        </div>

        <div className="rounded-lg border p-3">
          <div className="font-medium mb-1">Cadastros</div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!editPerms?.registry?.read}
              onChange={() => toggleEdit("registry.read")}
            />
            Leitura
          </label>
          <label className="flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              checked={!!editPerms?.registry?.write}
              onChange={() => toggleEdit("registry.write")}
            />
            Edição
          </label>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => { setEditTarget(null); setEditPerms(null); setEditMsg(null); }}
          disabled={savingEdit}
        >
          Cancelar
        </button>
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={saveEditPerms}
          disabled={savingEdit}
          title="Salvar permissões"
        >
          {savingEdit ? "Salvando..." : "Salvar"}
        </button>
      </div>

      {editMsg && <div className="mt-3 text-sm">{editMsg}</div>}
    </div>
  </div>
)}
      <div className="text-sm opacity-80">
        Dicas rápidas: <Link className="underline" href="/equipe">/equipe</Link>
      </div>
    </div>
  );
}
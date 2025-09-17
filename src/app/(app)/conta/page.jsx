// src/app/(app)/conta/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

const ROLE_OPTIONS = [
  { value: "financeiro", label: "Financeiro" },
  { value: "professor",  label: "Professor"  },
];

export default function MinhaContaPage() {
  const [loading, setLoading]   = useState(true);
  const [user, setUser]         = useState(null);
  const [claim, setClaim]       = useState(null); // sua claim (tenant + role)
  const [tenant, setTenant]     = useState(null); // dados do tenant
  const [members, setMembers]   = useState([]);   // claims do tenant
  const [roleInvite, setRoleInvite] = useState(ROLE_OPTIONS[0].value);
  const [inviteLink, setInviteLink] = useState("");
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: { user }, error: uErr } = await supabase.auth.getUser();
        if (uErr || !user) {
          window.location.href = "/login";
          return; // <— importante para encerrar aqui
        }

        // sua claim (primeira do usuário)
        const { data: myClaims, error: cErr } = await supabase
          .from("user_claims") // <— nome correto da tabela
          .select("tenant_id, role")
          .eq("user_id_uuid", user.id)
          .limit(1);

        if (cErr || !myClaims?.length) {
          setClaim(null);
          return;
        }

        const myClaim = myClaims[0];
        setClaim(myClaim);

        // dados do tenant
        const { data: tenants, error: tErr } = await supabase
          .from("tenants")
          .select("id, name, created_at")
          .eq("id", myClaim.tenant_id)
          .limit(1);

        if (!tErr && tenants?.[0]) setTenant(tenants[0]);

        // membros do mesmo tenant
        const { data: tenantClaims, error: mErr } = await supabase
          .from("user_claims") // <— nome correto
          .select("user_id_uuid, role, perms, created_at")
          .eq("tenant_id", myClaim.tenant_id)
          .order("created_at", { ascending: true });

        if (!mErr && tenantClaims) setMembers(tenantClaims);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  if (!claim) {
    return (
      <div className="mx-auto max-w-md p-6 text-center space-y-4">
        <p>Você ainda não possui acesso a um tenant. Peça um convite ao admin.</p>
        <Link href="/login" className="underline">Entrar</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Minha Conta</h1>
        <span className="text-sm opacity-70">
          Você: <code>{user?.email}</code> • Role: <strong>{claim.role}</strong>
        </span>
      </header>
      {isAdmin && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm mb-4">
          <div className="font-medium">🎛️ Você é o responsável pela conta</div>
          <div className="opacity-75">
            Como proprietário do tenant, você controla convites, preferências e cobrança.
          </div>
        </div>
      )}

      {/* Card: Dados do Tenant */}
      <section className="rounded-2xl border p-5 space-y-2">
        <h2 className="text-lg font-medium">Dados do Tenant</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div><span className="opacity-70">Tenant ID:</span> <code>{tenant?.id || claim.tenant_id}</code></div>
          <div><span className="opacity-70">Nome:</span> {tenant?.name || "-"}</div>
          <div><span className="opacity-70">Criado em:</span> {tenant?.created_at ? new Date(tenant.created_at).toLocaleString("pt-BR") : "-"}</div>
        </div>
      </section>

      {/* Card: Custos (placeholder para próximo passo) */}
      <section className="rounded-2xl border p-5 space-y-2">
        <h2 className="text-lg font-medium">Custos</h2>
        <p className="text-sm opacity-70">
          Em breve: plano, valor mensal, próximos vencimentos e consumo.
        </p>
      </section>

      {/* Card: Área do Proprietário (novo bloco) */}
      <section className="rounded-2xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Área do Proprietário</h2>
          {!isAdmin && <span className="text-xs opacity-70">Visível apenas para admin</span>}
        </div>

        {/* Sub-bloco: Equipe / Convites */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Equipe / Convites</h3>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <label className="text-sm">
              Role do convidado:
              <select
                className="ml-2 border rounded p-1 text-sm"
                value={roleInvite}
                onChange={e => setRoleInvite(e.target.value)}
                disabled={!isAdmin}
              >
                {ROLE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <button
              onClick={gerarLinkConvite}
              disabled={!isAdmin}
              className="border rounded px-3 py-1 text-sm"
            >
              Gerar & copiar link
            </button>
            {inviteLink && (
              <span className="text-xs">
                Link: <code className="break-all">{inviteLink}</code>
              </span>
            )}
          </div>
        </div>

        {/* Sub-bloco: Preferências do Tenant (placeholder) */}
        <div className="space-y-1 opacity-80">
          <h3 className="text-sm font-medium">Preferências do Tenant</h3>
          <p className="text-sm">Em breve: renomear tenant, branding (logo/cor), subdomínio.</p>
        </div>

        {/* Sub-bloco: Cobrança (placeholder) */}
        <div className="space-y-1 opacity-80">
          <h3 className="text-sm font-medium">Cobrança</h3>
          <p className="text-sm">Em breve: plano, forma de pagamento e faturas.</p>
        </div>

        {/* Lista de membros (sempre visível) */}
        <div className="pt-2">
          <h3 className="text-sm font-medium mb-2">Membros</h3>
          <div className="text-sm rounded border divide-y">
            {members.length === 0 && (
              <div className="p-2 opacity-70">Sem membros cadastrados.</div>
            )}
            {members.map(m => (
              <div key={`${m.user_id_uuid}-${m.role}`} className="p-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div>
                  <div><span className="opacity-70">User:</span> <code>{m.user_id_uuid}</code></div>
                  <div className="opacity-70 text-xs">Criado: {new Date(m.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <div>
                  <span className="px-2 py-1 rounded bg-gray-100 text-xs">{m.role}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Navegação útil */}
      <div className="text-sm opacity-80">
        Dicas rápidas:{" "}
        <Link className="underline" href="/equipe">/equipe</Link>{" "}
        •{" "}
        <Link className="underline" href="/accept-invite?tenant=TENANT&role=financeiro">/accept-invite</Link>
      </div>
    </div>
  );
}

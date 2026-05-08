// src/app/(app)/conta/page.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  User,
  Lock,
  Bell,
  Globe,
  Users,
  LogOut,
  Save,
  Camera,
  Loader2,
  Check,
  Plus,
  Pencil,
  Building2,
  ExternalLink,
} from "lucide-react";
import AppModal, { FormError, ModalActions } from "@/components/AppModal";

// ─── helpers ──────────────────────────────────────────────────────
function initialsFrom(name, email) {
  const src = String(name || email || "").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function displayNameFrom(user, claim) {
  return (
    claim?.user_name_snapshot ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    ""
  );
}

function roleLabel(role, isOwner) {
  if (isOwner) return "Proprietário";
  if (role === "admin") return "Administrador";
  if (role === "teacher") return "Professor";
  if (role === "staff") return "Operacional";
  return role || "Membro";
}

const DEFAULT_PERMS = {
  classes: { read: false, write: false },
  finance: { read: false, write: false },
  registry: { read: false, write: false },
};

// ─── Página ───────────────────────────────────────────────────────
export default function MinhaContaPage() {
  const [tab, setTab] = useState("perfil");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [user, setUser] = useState(null);
  const [claim, setClaim] = useState(null);
  const [tenant, setTenant] = useState(null);

  // Perfil
  const [profile, setProfile] = useState({ name: "", phone: "" });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Avatar
  const [avatarPreview, setAvatarPreview] = useState(null);
  const fileRef = useRef(null);

  // Equipe (admin)
  const [members, setMembers] = useState([]);
  const [membersError, setMembersError] = useState(null);
  const [canManageUsers, setCanManageUsers] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  const isOwner = useMemo(
    () => !!(user && tenant && tenant.owner_user_id === user.id),
    [user, tenant]
  );
  const isAdminUI = useMemo(
    () => isOwner || claim?.role === "admin",
    [isOwner, claim]
  );

  async function loadMembersByTenantId(tenantId) {
    setMembersError(null);
    const { data, error: err } = await supabase
      .from("user_claims")
      .select(
        "user_id, role, perms, created_at, user_name_snapshot, user_email_snapshot"
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    if (err) {
      console.warn("user_claims fetch failed:", err);
      setMembers([]);
      setMembersError(
        err?.message || err?.hint || err?.details || err?.code || "Falha ao carregar membros."
      );
      return;
    }

    const rows = (data ?? []).map((c) => ({
      ...c,
      display_name: c.user_name_snapshot || c.user_email_snapshot || c.user_id,
      display_email: c.user_email_snapshot || null,
    }));
    setMembers(rows);
  }

  // Boot
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const {
          data: { user: u },
          error: uErr,
        } = await supabase.auth.getUser();
        if (uErr) throw uErr;
        if (!u) {
          if (typeof window !== "undefined") {
            localStorage.setItem(
              "postLoginRedirect",
              window.location.pathname + window.location.search
            );
            window.location.href = "/login";
          }
          return;
        }
        if (cancelled) return;
        setUser(u);

        // 1) é proprietário?
        const { data: owned } = await supabase
          .from("tenants")
          .select("id, name, created_at, owner_user_id")
          .eq("owner_user_id", u.id)
          .limit(1);

        let resolvedTenant = null;
        let resolvedClaim = null;

        if (owned?.[0]) {
          resolvedTenant = owned[0];
          resolvedClaim = { tenant_id: owned[0].id, role: "admin" };
        }

        // 2) claim do usuário (sempre buscamos pra ter perms/snapshot)
        const { data: claims } = await supabase
          .from("user_claims")
          .select(
            "user_id, tenant_id, role, perms, user_name_snapshot, user_email_snapshot"
          )
          .eq("user_id", u.id)
          .limit(1);

        const c = claims?.[0] || null;
        if (c && !resolvedClaim) {
          resolvedClaim = c;
          // tenant pelo claim
          const { data: tn } = await supabase
            .from("tenants")
            .select("id, name, created_at, owner_user_id")
            .eq("id", c.tenant_id)
            .limit(1);
          if (tn?.[0]) resolvedTenant = tn[0];
        }

        if (cancelled) return;
        setTenant(resolvedTenant);
        setClaim(resolvedClaim);
        setProfile({
          name: c?.user_name_snapshot ||
            u?.user_metadata?.full_name ||
            u?.user_metadata?.name ||
            "",
          phone: u?.user_metadata?.phone || "",
        });

        // 3) carrega membros + permissão de gerenciar
        const tenantId = resolvedTenant?.id ?? resolvedClaim?.tenant_id;
        if (tenantId) {
          await loadMembersByTenantId(tenantId);
          const { data: canMU } = await supabase.rpc("can_manage_users");
          if (!cancelled) setCanManageUsers(!!canMU);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const name = profile.name || displayNameFrom(user, claim);
  const email = user?.email || "";
  const role = roleLabel(claim?.role, isOwner);
  const avatarUrl = avatarPreview || user?.user_metadata?.avatar_url || null;

  async function refreshMembers() {
    const tenantId = tenant?.id ?? claim?.tenant_id;
    if (tenantId) await loadMembersByTenantId(tenantId);
  }

  // Salvar (perfil ou senha — depende da aba)
  async function handleSave() {
    if (!user || saving) return;
    try {
      setSaving(true);
      setError(null);
      setSaved(false);

      if (tab === "seguranca") {
        if (!pw.next || pw.next.length < 8) {
          throw new Error("Nova senha deve ter ao menos 8 caracteres.");
        }
        if (pw.next !== pw.confirm) throw new Error("As senhas não coincidem.");
        const { error: upErr } = await supabase.auth.updateUser({
          password: pw.next,
        });
        if (upErr) throw upErr;
        setPw({ current: "", next: "", confirm: "" });
      } else {
        const { error: upErr } = await supabase.auth.updateUser({
          data: {
            full_name: profile.name || null,
            phone: profile.phone || null,
          },
        });
        if (upErr) throw upErr;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      setError(null);
      setAvatarPreview(URL.createObjectURL(file));
      const path = `${user.id}/avatar-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = data?.publicUrl;
      if (publicUrl) {
        const { error: metaErr } = await supabase.auth.updateUser({
          data: { avatar_url: publicUrl },
        });
        if (metaErr) throw metaErr;
      }
    } catch (e2) {
      setError(e2?.message || String(e2));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--p-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando conta…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md p-6 text-center space-y-4 text-sm">
        <p>Sessão não encontrada.</p>
        <Link href="/login" className="underline">Entrar</Link>
      </div>
    );
  }

  const tabs = [
    { key: "perfil", label: "Perfil", icon: User },
    { key: "seguranca", label: "Segurança", icon: Lock },
    ...(isAdminUI ? [{ key: "equipe", label: "Equipe", icon: Users }] : []),
    { key: "notificacoes", label: "Notificações", icon: Bell },
    { key: "preferencias", label: "Preferências", icon: Globe },
  ];

  const showSaveButton = tab === "perfil" || tab === "seguranca";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {error && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          Erro: {error}
        </div>
      )}

      {/* Avatar / Header */}
      <div className="p-card p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="relative">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={name || "avatar"}
                  className="h-16 w-16 rounded-full object-cover shadow-sm"
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-full bg-[var(--p-primary)] text-white text-xl font-semibold shadow-sm">
                  {initialsFrom(name, email)}
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--p-surface)] bg-[var(--p-surface-2)] text-[var(--p-text-muted)] hover:bg-[var(--p-surface)] hover:text-[var(--p-text)]"
                aria-label="Trocar foto"
                title="Trocar foto"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {name || "—"}
              </h1>
              <p className="mt-0.5 text-sm text-[var(--p-text-muted)] truncate">
                {email || "—"}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span
                  className={`p-chip ${
                    isOwner ? "p-chip-success" : "p-chip-neutral"
                  }`}
                >
                  {role}
                </span>
                {tenant?.name && (
                  <span className="p-chip p-chip-neutral">{tenant.name}</span>
                )}
              </div>
            </div>
          </div>
          {showSaveButton && (
            <button
              className="p-btn p-btn-primary self-start"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>{saving ? "Salvando…" : saved ? "Salvo" : "Salvar"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 min-w-max border-b border-[var(--p-border)]">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={[
                  "inline-flex items-center gap-2 px-3 py-2.5 text-sm transition-colors border-b-2 -mb-px",
                  active
                    ? "border-[var(--p-primary)] text-[var(--p-primary)] font-medium"
                    : "border-transparent text-[var(--p-text-muted)] hover:text-[var(--p-text)]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo das abas */}
      {tab === "perfil" && (
        <div className="p-card p-5 md:p-6 flex flex-col gap-4">
          <Field
            label="Nome completo"
            value={profile.name}
            onChange={(v) => setProfile((p) => ({ ...p, name: v }))}
          />
          <Field label="E-mail" value={email} type="email" readOnly />
          <Field
            label="Telefone"
            value={profile.phone}
            onChange={(v) => setProfile((p) => ({ ...p, phone: v }))}
            placeholder="(00) 00000-0000"
          />
          <Field label="Cargo" value={role} readOnly />
          {saved && (
            <div className="text-xs text-[var(--p-success)]">
              Alterações salvas.
            </div>
          )}
        </div>
      )}

      {tab === "seguranca" && (
        <div className="flex flex-col gap-4">
          <div className="p-card p-5 md:p-6">
            <h2 className="text-sm font-semibold">Alterar senha</h2>
            <p className="mt-0.5 text-xs text-[var(--p-text-muted)]">
              Use ao menos 8 caracteres, com letras e números.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <Field
                label="Senha atual"
                value={pw.current}
                onChange={(v) => setPw((p) => ({ ...p, current: v }))}
                type="password"
                placeholder="••••••••"
              />
              <Field
                label="Nova senha"
                value={pw.next}
                onChange={(v) => setPw((p) => ({ ...p, next: v }))}
                type="password"
                placeholder="mínimo 8 caracteres"
              />
              <Field
                label="Confirmar nova senha"
                value={pw.confirm}
                onChange={(v) => setPw((p) => ({ ...p, confirm: v }))}
                type="password"
              />
            </div>
            {saved && (
              <div className="mt-3 text-xs text-[var(--p-success)]">
                Senha atualizada.
              </div>
            )}
          </div>
          <div className="p-card p-5 md:p-6">
            <h2 className="text-sm font-semibold">Sessão atual</h2>
            <p className="mt-0.5 text-xs text-[var(--p-text-muted)]">
              {user?.last_sign_in_at
                ? `Última autenticação: ${new Date(user.last_sign_in_at).toLocaleString("pt-BR")}`
                : "Nenhum histórico disponível."}
            </p>
          </div>
        </div>
      )}

      {tab === "equipe" && isAdminUI && (
        <TeamTab
          tenant={tenant}
          claim={claim}
          members={members}
          membersError={membersError}
          canManageUsers={canManageUsers}
          onCreateUser={() => setShowCreateUser(true)}
          onEditMember={(m) => setEditTarget(m)}
        />
      )}

      {tab === "notificacoes" && (
        <div className="p-card p-5 md:p-6 flex flex-col gap-4">
          <Toggle
            label="Lembretes de mensalidade em atraso"
            desc="Receber resumo diário por e-mail."
            on
          />
          <Toggle
            label="Novos alunos matriculados"
            desc="Notificação no painel."
            on
          />
          <Toggle
            label="Relatório semanal"
            desc="E-mail toda segunda-feira."
          />
          <Toggle
            label="Novidades do produto"
            desc="E-mails ocasionais com atualizações."
          />
          <p className="text-xs text-[var(--p-text-muted)]">
            (Em desenvolvimento — preferências ainda não persistem.)
          </p>
        </div>
      )}

      {tab === "preferencias" && (
        <div className="p-card p-5 md:p-6 flex flex-col gap-4">
          <Field label="Idioma" value="Português (Brasil)" readOnly />
          <Field
            label="Fuso horário"
            value="América / São Paulo (UTC-3)"
            readOnly
          />
          <Field label="Formato de data" value="DD/MM/AAAA" readOnly />
          <Field label="Moeda" value="Real (R$)" readOnly />
        </div>
      )}

      {/* Logout */}
      <div className="flex justify-end">
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            if (typeof window !== "undefined")
              window.location.href = "/login";
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-xs font-medium text-[var(--p-danger)] hover:bg-[var(--p-danger-50)]"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair da conta
        </button>
      </div>

      {/* Modais admin */}
      {showCreateUser && canManageUsers && (
        <CreateUserModal
          tenantId={tenant?.id ?? claim?.tenant_id}
          onClose={() => setShowCreateUser(false)}
          onCreated={async () => {
            setShowCreateUser(false);
            await refreshMembers();
          }}
        />
      )}

      {editTarget && canManageUsers && (
        <EditPermsModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={async () => {
            setEditTarget(null);
            await refreshMembers();
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-componente: aba Equipe ─────────────────────────────────
function TeamTab({
  tenant,
  claim,
  members,
  membersError,
  canManageUsers,
  onCreateUser,
  onEditMember,
}) {
  return (
    <div className="space-y-5">
      {/* Tenant info */}
      <div className="p-card p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--p-primary-50)] text-[var(--p-primary)]">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">
                {tenant?.name || "Tenant"}
              </div>
              <div className="text-xs text-[var(--p-text-muted)]">
                ID: <code className="font-mono">{tenant?.id || claim?.tenant_id}</code>
              </div>
              {tenant?.created_at && (
                <div className="text-xs text-[var(--p-text-muted)]">
                  Criado em{" "}
                  {new Date(tenant.created_at).toLocaleString("pt-BR")}
                </div>
              )}
            </div>
          </div>
          <Link
            href="/configuracoes"
            className="p-btn p-btn-ghost text-xs"
            title="Abrir Configurações"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Configurações</span>
          </Link>
        </div>
      </div>

      {/* Membros */}
      <div className="p-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--p-border)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Membros da equipe</h2>
            <p className="text-xs text-[var(--p-text-muted)]">
              Cadastre membros e ajuste suas permissões.
            </p>
          </div>
          {canManageUsers && (
            <button
              onClick={onCreateUser}
              className="p-btn p-btn-primary text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cadastrar usuário</span>
              <span className="sm:hidden">Novo</span>
            </button>
          )}
        </div>

        {membersError && (
          <div className="border-b border-[var(--p-border)] bg-[var(--p-danger-50)] px-5 py-3 text-xs text-[var(--p-danger)]">
            {membersError}
          </div>
        )}

        {members.length === 0 && !membersError ? (
          <div className="px-5 py-12 text-center text-sm text-[var(--p-text-muted)]">
            Sem membros cadastrados.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--p-border)]">
            {members.map((m) => (
              <li
                key={`${m.user_id}-${m.role}-${m.created_at}`}
                className="flex items-start gap-3 px-5 py-3"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--p-primary-50)] text-[var(--p-primary)] text-xs font-semibold">
                  {initialsFrom(m.display_name, m.display_email)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{m.display_name}</div>
                  {m.display_email && (
                    <div className="text-xs text-[var(--p-text-muted)] truncate">
                      {m.display_email}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="p-chip p-chip-neutral">
                      {m.role || "—"}
                    </span>
                    <PermsSummary perms={m.perms} />
                  </div>
                </div>
                {canManageUsers && (
                  <button
                    onClick={() => onEditMember(m)}
                    className="shrink-0 rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                    aria-label="Editar permissões"
                    title="Editar permissões"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PermsSummary({ perms }) {
  if (!perms) return null;
  const parts = [];
  if (perms?.classes?.read) parts.push("Turmas:R" + (perms?.classes?.write ? "W" : ""));
  if (perms?.finance?.read) parts.push("Financeiro:R" + (perms?.finance?.write ? "W" : ""));
  if (perms?.registry?.read) parts.push("Cadastros:R" + (perms?.registry?.write ? "W" : ""));
  if (parts.length === 0) return null;
  return (
    <span className="text-[11px] text-[var(--p-text-muted)]">
      {parts.join(" · ")}
    </span>
  );
}

// ─── Modal: Cadastrar usuário ────────────────────────────────────
function CreateUserModal({ tenantId, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    cpf: "",
    password: "",
    role: "",
  });
  const [perms, setPerms] = useState({
    classes: { read: true, write: false },
    finance: { read: false, write: false },
    registry: { read: false, write: false },
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  function togglePerm(path) {
    setPerms((prev) => {
      const [area, key] = path.split(".");
      const areaObj = prev?.[area] ?? { read: false, write: false };
      return { ...prev, [area]: { ...areaObj, [key]: !areaObj[key] } };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    if (!form.email) return setErr("Informe um e-mail.");
    if (!form.password || form.password.length < 8)
      return setErr("Senha precisa ter ao menos 8 caracteres.");
    if (!form.role || form.role.trim().length < 3)
      return setErr('Informe uma identificação (ex.: "teacher B", "adm Bruno").');
    if (!tenantId) return setErr("Tenant inválido na sessão.");

    try {
      setSaving(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setErr("Sessão inválida. Faça login novamente.");
        return;
      }

      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          name: form.name,
          phone: form.phone,
          cpf: form.cpf,
          role: form.role,
          tenant_id: tenantId,
          perms,
        }),
      });

      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409)
          setErr("Este e-mail já está vinculado a outra escola. Use outro e-mail.");
        else setErr(out?.error || "Falha ao criar usuário.");
        return;
      }

      if (out?.status === "already_member")
        setMsg("Usuário já é membro desta escola.");
      else if (out?.status === "linked_existing")
        setMsg("Usuário já existia. Vinculado a esta escola com sucesso.");
      else if (out?.status === "created_and_confirmed")
        setMsg("Usuário criado com sucesso.");
      else setMsg("Operação concluída.");

      setTimeout(async () => {
        await onCreated();
      }, 600);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      title="Cadastrar usuário"
      onClose={saving ? () => {} : onClose}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        {msg && (
          <div className="rounded-lg border border-[var(--p-success)]/30 bg-[var(--p-success-50)] px-3 py-2 text-xs text-[var(--p-success)]">
            {msg}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ModalField
            label="Nome"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="Nome completo"
            colSpan="full"
          />
          <ModalField
            label="E-mail"
            type="email"
            value={form.email}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            placeholder="email@exemplo.com"
            colSpan="full"
          />
          <ModalField
            label="Telefone"
            type="tel"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            placeholder="(00) 00000-0000"
          />
          <ModalField
            label="CPF"
            value={form.cpf}
            onChange={(v) => setForm((f) => ({ ...f, cpf: v }))}
            placeholder="000.000.000-00"
          />
          <ModalField
            label="Senha inicial"
            type="password"
            value={form.password}
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
            placeholder="Mín. 8 caracteres"
          />
          <ModalField
            label="Identificação"
            value={form.role}
            onChange={(v) => setForm((f) => ({ ...f, role: v }))}
            placeholder='ex.: "teacher B", "adm Bruno"'
          />
        </div>

        <PermsGrid perms={perms} onToggle={togglePerm} />

        <ModalActions
          onCancel={onClose}
          submitting={saving}
          submitLabel="Cadastrar"
        />
      </form>
    </AppModal>
  );
}

// ─── Modal: Editar permissões ────────────────────────────────────
function EditPermsModal({ target, onClose, onSaved }) {
  const merged = useMemo(() => {
    return {
      classes: { ...DEFAULT_PERMS.classes, ...(target?.perms?.classes || {}) },
      finance: { ...DEFAULT_PERMS.finance, ...(target?.perms?.finance || {}) },
      registry: { ...DEFAULT_PERMS.registry, ...(target?.perms?.registry || {}) },
    };
  }, [target]);
  const [perms, setPerms] = useState(merged);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  function toggle(path) {
    setPerms((prev) => {
      const [area, key] = path.split(".");
      const areaObj = prev?.[area] ?? { read: false, write: false };
      return { ...prev, [area]: { ...areaObj, [key]: !areaObj[key] } };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      setSaving(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setErr("Sessão inválida.");
        return;
      }
      const res = await fetch("/api/admin/update-user-perms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ user_id: target?.user_id, perms }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(out?.error || "Falha ao salvar permissões.");
        return;
      }
      setMsg("Permissões atualizadas.");
      setTimeout(async () => {
        await onSaved();
      }, 600);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      title="Editar permissões"
      onClose={saving ? () => {} : onClose}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <p className="text-xs text-[var(--p-text-muted)]">
          Ajuste as permissões de{" "}
          <span className="font-medium text-[var(--p-text)]">
            {target?.display_name || target?.display_email || target?.user_id}
          </span>
          .
        </p>
        <FormError message={err} />
        {msg && (
          <div className="rounded-lg border border-[var(--p-success)]/30 bg-[var(--p-success-50)] px-3 py-2 text-xs text-[var(--p-success)]">
            {msg}
          </div>
        )}
        <PermsGrid perms={perms} onToggle={toggle} />
        <ModalActions
          onCancel={onClose}
          submitting={saving}
          submitLabel="Salvar"
        />
      </form>
    </AppModal>
  );
}

// ─── Helpers de form ────────────────────────────────────────────
function PermsGrid({ perms, onToggle }) {
  const areas = [
    { key: "classes", label: "Turmas" },
    { key: "finance", label: "Financeiro" },
    { key: "registry", label: "Cadastros" },
  ];
  return (
    <div className="border-t border-[var(--p-border)] pt-4">
      <div className="text-sm font-medium mb-2">Permissões</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {areas.map((a) => (
          <div
            key={a.key}
            className="rounded-lg border border-[var(--p-border)] p-3"
          >
            <div className="font-medium text-sm mb-1">{a.label}</div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!!perms?.[a.key]?.read}
                onChange={() => onToggle(`${a.key}.read`)}
              />
              Leitura
            </label>
            <label className="mt-1 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={!!perms?.[a.key]?.write}
                onChange={() => onToggle(`${a.key}.write`)}
              />
              Edição
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModalField({ label, value, type = "text", placeholder, onChange, colSpan }) {
  return (
    <div className={colSpan === "full" ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-xs font-medium text-[var(--p-text-muted)]">
        {label}
      </label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
      />
    </div>
  );
}

function Field({ label, value, type = "text", placeholder, onChange, readOnly }) {
  const controlled = typeof onChange === "function";
  return (
    <div className="grid gap-1 sm:grid-cols-[180px_1fr] sm:items-center sm:gap-4">
      <label className="text-xs font-medium text-[var(--p-text-muted)]">
        {label}
      </label>
      <input
        type={type}
        {...(controlled ? { value: value ?? "" } : { defaultValue: value })}
        onChange={controlled ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        placeholder={placeholder}
        className={[
          "w-full rounded-lg border border-[var(--p-border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40",
          readOnly
            ? "bg-[var(--p-surface-2)] text-[var(--p-text-muted)] cursor-not-allowed"
            : "bg-[var(--p-surface)]",
        ].join(" ")}
      />
    </div>
  );
}

function Toggle({ label, desc, on }) {
  const [state, setState] = useState(!!on);
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {desc && (
          <div className="mt-0.5 text-xs text-[var(--p-text-muted)]">{desc}</div>
        )}
      </div>
      <button
        onClick={() => setState(!state)}
        className={[
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          state ? "bg-[var(--p-primary)]" : "bg-[var(--p-border-strong)]",
        ].join(" ")}
        aria-pressed={state}
        type="button"
      >
        <span
          className={[
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all",
            state ? "left-[22px]" : "left-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

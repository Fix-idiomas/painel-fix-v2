"use client";

import { useEffect, useRef, useState } from "react";
import PreviewShell from "../_components/PreviewShell";
import { supabase } from "@/lib/supabaseClient";
import {
  User,
  Lock,
  Bell,
  Globe,
  LogOut,
  Save,
  Camera,
  Loader2,
  Check,
} from "lucide-react";

const TABS = [
  { key: "perfil",        label: "Perfil",         icon: User },
  { key: "seguranca",     label: "Segurança",      icon: Lock },
  { key: "notificacoes",  label: "Notificações",   icon: Bell },
  { key: "preferencias",  label: "Preferências",   icon: Globe },
];

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

export default function ContaPreview() {
  const [tab, setTab] = useState("perfil");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [claim, setClaim] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [profile, setProfile] = useState({ name: "", phone: "" });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: userRes, error: uErr } = await supabase.auth.getUser();
        if (uErr) throw uErr;
        const u = userRes?.user || null;
        if (cancelled) return;
        setUser(u);

        if (!u) {
          setLoading(false);
          return;
        }

        const { data: ownedTenants } = await supabase
          .from("tenants")
          .select("id, name, owner_user_id")
          .eq("owner_user_id", u.id)
          .limit(1);

        if (ownedTenants?.[0]) {
          if (!cancelled) setTenant(ownedTenants[0]);
        }

        const { data: claims } = await supabase
          .from("user_claims")
          .select("user_id, tenant_id, role, perms, user_name_snapshot, user_email_snapshot")
          .eq("user_id", u.id)
          .limit(1);

        if (cancelled) return;
        const c = claims?.[0] || null;
        setClaim(c);
        setProfile({
          name:
            c?.user_name_snapshot ||
            u?.user_metadata?.full_name ||
            u?.user_metadata?.name ||
            "",
          phone: u?.user_metadata?.phone || "",
        });

        if (!ownedTenants?.[0] && c?.tenant_id) {
          const { data: tn } = await supabase
            .from("tenants")
            .select("id, name, owner_user_id")
            .eq("id", c.tenant_id)
            .limit(1);
          if (!cancelled && tn?.[0]) setTenant(tn[0]);
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const name = profile.name || displayNameFrom(user, claim);
  const email = user?.email || "";
  const isOwner = !!(user && tenant && tenant.owner_user_id === user.id);
  const role = roleLabel(claim?.role, isOwner);

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
        if (pw.next !== pw.confirm) {
          throw new Error("As senhas não coincidem.");
        }
        const { error: upErr } = await supabase.auth.updateUser({ password: pw.next });
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

  const avatarUrl = avatarPreview || user?.user_metadata?.avatar_url || null;

  return (
    <PreviewShell
      active=""
      crumb="Usuário"
      title="Minha conta"
      rightAction={
        tab === "notificacoes" || tab === "preferencias" ? null : (
          <button
            className="p-btn p-btn-primary"
            onClick={handleSave}
            disabled={saving || !user}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {saving ? "Salvando…" : saved ? "Salvo" : "Salvar"}
            </span>
          </button>
        )
      }
    >
      <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
        {error && (
          <div className="mb-4 rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
            Erro ao carregar conta: {error}
          </div>
        )}

        <div className="p-card mb-6 p-5 md:p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--p-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando conta…
            </div>
          ) : !user ? (
            <div className="text-sm text-[var(--p-text-muted)]">
              Sessão não encontrada. Faça login para ver seus dados.
            </div>
          ) : (
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
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight truncate">{name || "—"}</h1>
                <p className="mt-0.5 text-sm text-[var(--p-text-muted)] truncate">{email || "—"}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`p-chip ${isOwner ? "p-chip-success" : "p-chip-neutral"}`}>{role}</span>
                  {tenant?.name && <span className="p-chip p-chip-neutral">{tenant.name}</span>}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1 min-w-max border-b border-[var(--p-border)]">
            {TABS.map((t) => {
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
              <div className="text-xs text-[var(--p-success)]">Alterações salvas.</div>
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
                <div className="mt-3 text-xs text-[var(--p-success)]">Senha atualizada.</div>
              )}
            </div>
            <div className="p-card p-5 md:p-6">
              <h2 className="text-sm font-semibold">Sessão atual</h2>
              <p className="mt-0.5 text-xs text-[var(--p-text-muted)]">
                {user?.last_sign_in_at ? `Última autenticação: ${new Date(user.last_sign_in_at).toLocaleString("pt-BR")}` : "Nenhum histórico disponível."}
              </p>
            </div>
          </div>
        )}

        {tab === "notificacoes" && (
          <div className="p-card p-5 md:p-6 flex flex-col gap-4">
            <Toggle label="Lembretes de mensalidade em atraso" desc="Receber resumo diário por e-mail." on />
            <Toggle label="Novos alunos matriculados" desc="Notificação no painel." on />
            <Toggle label="Relatório semanal" desc="E-mail toda segunda-feira." />
            <Toggle label="Novidades do produto" desc="E-mails ocasionais com atualizações." />
          </div>
        )}

        {tab === "preferencias" && (
          <div className="p-card p-5 md:p-6 flex flex-col gap-4">
            <Field label="Idioma" value="Português (Brasil)" />
            <Field label="Fuso horário" value="América / São Paulo (UTC-3)" />
            <Field label="Formato de data" value="DD/MM/AAAA" />
            <Field label="Moeda" value="Real (R$)" />
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              if (typeof window !== "undefined") window.location.href = "/login";
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-xs font-medium text-[var(--p-danger)] hover:bg-[var(--p-danger-50)]"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair da conta
          </button>
        </div>
      </div>
    </PreviewShell>
  );
}

function Field({ label, value, type = "text", placeholder, onChange, readOnly }) {
  const controlled = typeof onChange === "function";
  return (
    <div className="grid gap-1 sm:grid-cols-[180px_1fr] sm:items-center sm:gap-4">
      <label className="text-xs font-medium text-[var(--p-text-muted)]">{label}</label>
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
        {desc && <div className="mt-0.5 text-xs text-[var(--p-text-muted)]">{desc}</div>}
      </div>
      <button
        onClick={() => setState(!state)}
        className={["relative h-6 w-11 shrink-0 rounded-full transition-colors", state ? "bg-[var(--p-primary)]" : "bg-[var(--p-border-strong)]"].join(" ")}
        aria-pressed={state}
      >
        <span className={["absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all", state ? "left-[22px]" : "left-0.5"].join(" ")} />
      </button>
    </div>
  );
}

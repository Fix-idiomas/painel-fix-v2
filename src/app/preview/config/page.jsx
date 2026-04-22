"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PreviewShell from "../_components/PreviewShell";
import PreviewModal, { FormError, ModalActions } from "../_components/PreviewModal";
import { supabase } from "@/lib/supabaseClient";
import { supabaseGateway } from "@/lib/supabaseGateway";
import {
  Building2,
  Palette,
  UserCog,
  Shield,
  Bell,
  Mail,
  Database,
  CreditCard,
  Save,
  ChevronRight,
  Loader2,
  Check,
  Copy,
  Send,
} from "lucide-react";

const ROLE_LABEL = {
  admin: "Administrador",
  owner: "Proprietário",
  teacher: "Professor",
  staff: "Operacional",
};

const AVATAR_PALETTE = [
  "#8B1C2C", "#E94F37", "#0F766E", "#D97706", "#1E40AF",
  "#7C3AED", "#BE123C", "#0891B2", "#15803D", "#9333EA", "#DC2626", "#059669",
];
function colorFor(seed) {
  const s = String(seed || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
function initialsFrom(name, email) {
  const src = String(name || email || "").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const SECTIONS = [
  { key: "geral",       label: "Geral",          icon: Building2, desc: "Nome, endereço, contato" },
  { key: "aparencia",   label: "Aparência",      icon: Palette,   desc: "Cores, logo, identidade visual" },
  { key: "usuarios",    label: "Usuários",       icon: UserCog,   desc: "Equipe e convites" },
  { key: "permissoes",  label: "Permissões",     icon: Shield,    desc: "Papéis e acessos" },
  { key: "notificacoes", label: "Notificações",  icon: Bell,      desc: "E-mail, lembretes, alertas" },
  { key: "email",       label: "E-mail",         icon: Mail,      desc: "Domínio e templates" },
  { key: "cobranca",    label: "Cobrança",       icon: CreditCard, desc: "Plano e faturamento" },
  { key: "dados",       label: "Dados",          icon: Database,  desc: "Exportar, backup, LGPD" },
];

export default function ConfigMock() {
  const [active, setActive] = useState("geral");
  const [users, setUsers] = useState([]);
  const [tenant, setTenant] = useState(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState(null);
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const logoInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setUsersLoading(true);
        setUsersError(null);
        const { data: userRes } = await supabase.auth.getUser();
        const u = userRes?.user || null;
        if (cancelled) return;
        if (!u) {
          setUsers([]);
          return;
        }

        // Find tenant: owned first, fallback to claim
        const { data: ownedTenants } = await supabase
          .from("tenants")
          .select("id, name, owner_user_id")
          .eq("owner_user_id", u.id)
          .limit(1);
        let tn = ownedTenants?.[0] || null;
        if (!tn) {
          const { data: myClaim } = await supabase
            .from("user_claims")
            .select("tenant_id")
            .eq("user_id", u.id)
            .limit(1);
          const tenantId = myClaim?.[0]?.tenant_id;
          if (tenantId) {
            const { data: tn2 } = await supabase
              .from("tenants")
              .select("id, name, owner_user_id")
              .eq("id", tenantId)
              .limit(1);
            tn = tn2?.[0] || null;
          }
        }
        if (cancelled) return;
        setTenant(tn);

        if (!tn) {
          setUsers([]);
          return;
        }

        const { data: claims, error: claimsErr } = await supabase
          .from("user_claims")
          .select("user_id, role, created_at, user_name_snapshot, user_email_snapshot")
          .eq("tenant_id", tn.id)
          .order("created_at", { ascending: true });
        if (cancelled) return;
        if (claimsErr) throw claimsErr;

        const rows = (claims || []).map((c) => {
          const isOwner = c.user_id === tn.owner_user_id;
          return {
            user_id: c.user_id,
            name: c.user_name_snapshot || c.user_email_snapshot || c.user_id,
            email: c.user_email_snapshot || "",
            role: isOwner ? "Proprietário" : (ROLE_LABEL[c.role] || c.role || "Membro"),
            active: true,
            isCurrent: c.user_id === u.id,
          };
        });
        setUsers(rows);

        try {
          const s = await supabaseGateway.getTenantSettings?.();
          if (!cancelled && s) {
            setBrandName(s.brand_name || tn?.name || "");
            setLogoUrl(s.logo_url || "");
          } else if (!cancelled) {
            setBrandName(tn?.name || "");
          }
        } catch { /* settings optional */ }
      } catch (e) {
        if (!cancelled) setUsersError(e?.message || String(e));
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSave() {
    if (saving) return;
    try {
      setSaving(true);
      setSaveErr(null);
      setSaveOk(false);
      const payload = {};
      const trimmed = (brandName || "").trim();
      if (trimmed) payload.brand_name = trimmed;
      if (logoUrl !== undefined) payload.logo_url = logoUrl || null;
      await supabaseGateway.upsertTenantSettings(payload);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (e) {
      setSaveErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      setSaveErr(null);
      let tenantId = tenant?.id;
      if (!tenantId) {
        const { data: t, error: te } = await supabase.rpc("current_tenant_id");
        if (te) throw te;
        tenantId = t;
      }
      if (!tenantId) throw new Error("Tenant ausente.");
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${tenantId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      const publicUrl = data?.publicUrl;
      if (!publicUrl) throw new Error("Falha ao obter URL pública.");
      setLogoUrl(publicUrl);
      await supabaseGateway.upsertTenantSettings({ logo_url: publicUrl });
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (e2) {
      setSaveErr(e2?.message || String(e2));
    } finally {
      setUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [users]);

  return (
    <PreviewShell
      active="config"
      crumb="Sistema"
      title="Configurações"
      rightAction={
        <button
          className="p-btn p-btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saveOk ? (
            <Check className="h-4 w-4" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {saving ? "Salvando…" : saveOk ? "Salvo" : "Salvar"}
          </span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Configurações</h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            Ajustes da organização e preferências do sistema.
          </p>
        </div>

        {saveErr && (
          <div className="mb-4 rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
            {saveErr}
          </div>
        )}
        {saveOk && (
          <div className="mb-4 rounded-lg border border-[var(--p-success)]/30 bg-[var(--p-success-50)] px-4 py-3 text-sm text-[var(--p-success)]">
            Alterações salvas.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr] lg:gap-6">
          {/* Section list */}
          <nav className="p-card p-2">
            <ul className="flex flex-col gap-0.5">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const isActive = active === s.key;
                return (
                  <li key={s.key}>
                    <button
                      onClick={() => setActive(s.key)}
                      className={[
                        "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                        isActive ? "bg-[var(--p-primary-50)] text-[var(--p-primary)]" : "text-[var(--p-text)] hover:bg-[var(--p-surface-2)]",
                      ].join(" ")}
                    >
                      <Icon className={`h-4 w-4 ${isActive ? "text-[var(--p-primary)]" : "text-[var(--p-text-muted)]"}`} />
                      <span className="flex-1 truncate">{s.label}</span>
                      <ChevronRight className={`h-3 w-3 transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Content */}
          <div className="flex flex-col gap-4 lg:gap-6">
            {active === "geral" && (
              <>
                <Panel title="Organização" desc="Informações públicas da escola.">
                  <Field
                    label="Nome fantasia"
                    value={brandName}
                    onChange={setBrandName}
                  />
                  <Field label="Razão social" value="Fix Escola de Idiomas LTDA" />
                  <Field label="CNPJ" value="00.000.000/0001-00" />
                  <Field label="Telefone" value="(11) 99999-9999" />
                  <Field label="E-mail de contato" value="contato@fixidiomas.com.br" />
                </Panel>

                <Panel title="Endereço" desc="Local da unidade principal.">
                  <Field label="CEP" value="01310-100" />
                  <Field label="Endereço" value="Av. Paulista, 1578 — Bela Vista" />
                  <Field label="Cidade / UF" value="São Paulo / SP" />
                </Panel>
              </>
            )}

            {active === "aparencia" && (
              <Panel title="Identidade visual" desc="Cores e logo exibidos nos e-mails e no painel.">
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl}
                      alt="logo"
                      className="h-16 w-16 rounded-xl object-cover shadow-sm"
                    />
                  ) : (
                    <div className="grid h-16 w-16 place-items-center rounded-xl bg-[var(--p-primary)] text-white text-xl font-semibold shadow-sm">
                      {(brandName || "F").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium">Logo atual</div>
                    <div className="text-xs text-[var(--p-text-muted)]">PNG · 512×512</div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                    <button
                      className="p-btn p-btn-ghost mt-2 h-8 px-3 text-xs"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Enviando…
                        </>
                      ) : (
                        "Trocar logo"
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium">Cor primária</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {["#8B1C2C", "#E94F37", "#0F766E", "#1E40AF", "#7C3AED", "#18181B"].map((c) => (
                      <button
                        key={c}
                        className={[
                          "h-9 w-9 rounded-lg border-2 transition-all",
                          c === "#8B1C2C" ? "border-[var(--p-text)] scale-110" : "border-transparent hover:scale-105",
                        ].join(" ")}
                        style={{ background: c }}
                        aria-label={c}
                      />
                    ))}
                  </div>
                </div>
              </Panel>
            )}

            {active === "usuarios" && (
              <Panel
                title="Equipe"
                desc={tenant?.name ? `Membros de ${tenant.name}.` : "Quem tem acesso ao painel."}
                action={
                  <button
                    className="p-btn p-btn-primary h-9 px-3 text-xs"
                    onClick={() => setInviteOpen(true)}
                  >
                    Convidar
                  </button>
                }
              >
                {usersError && (
                  <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-3 py-2 text-xs text-[var(--p-danger)]">
                    {usersError}
                  </div>
                )}
                {usersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-[var(--p-text-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando membros…
                  </div>
                ) : sortedUsers.length === 0 ? (
                  <div className="text-sm text-[var(--p-text-muted)]">
                    Nenhum membro encontrado.
                  </div>
                ) : (
                  <ul className="-mx-5 divide-y divide-[var(--p-border)]">
                    {sortedUsers.map((u) => (
                      <li key={u.user_id} className="flex items-center gap-3 px-5 py-3">
                        <div
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                          style={{ background: colorFor(u.name || u.email) }}
                        >
                          {initialsFrom(u.name, u.email)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{u.name || "—"}</div>
                          <div className="text-xs text-[var(--p-text-muted)] truncate">{u.email || "—"}</div>
                        </div>
                        <span className="p-chip p-chip-neutral">{u.role}</span>
                        {u.isCurrent && <span className="p-chip p-chip-success">Você</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            )}

            {["permissoes", "notificacoes", "email", "cobranca", "dados"].includes(active) && (
              <Panel title={SECTIONS.find((s) => s.key === active)?.label} desc="Seção em preview — conteúdo detalhado virá ao integrar.">
                <div className="rounded-lg border border-dashed border-[var(--p-border)] bg-[var(--p-surface-2)] p-6 text-center text-xs text-[var(--p-text-muted)]">
                  Mockup · estrutura pronta para receber os campos reais
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>

      {inviteOpen && (
        <InviteModal
          tenant={tenant}
          onClose={() => setInviteOpen(false)}
        />
      )}
    </PreviewShell>
  );
}

function InviteModal({ tenant, onClose }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("teacher");
  const [err, setErr] = useState(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);

  function handleGenerate(e) {
    e.preventDefault();
    setErr(null);
    const trimmed = email.trim();
    if (!trimmed) { setErr("E-mail é obrigatório"); return; }
    if (!tenant?.id) { setErr("Tenant não identificado."); return; }
    const perms = { role };
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${base}/accept-invite?tenant=${encodeURIComponent(tenant.id)}&perms=${encodeURIComponent(JSON.stringify(perms))}`;
    setInviteUrl(url);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      setErr(e?.message || "Falha ao copiar");
    }
  }

  function handleMail() {
    const subject = encodeURIComponent(`Convite para ${tenant?.name || "o painel"}`);
    const body = encodeURIComponent(
      `Olá,\n\nVocê foi convidado(a) para acessar o painel${tenant?.name ? ` de ${tenant.name}` : ""}.\n\nAcesse o link abaixo para aceitar o convite:\n\n${inviteUrl}\n\nAté logo!`
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }

  return (
    <PreviewModal title="Convidar membro" onClose={onClose}>
      <form onSubmit={handleGenerate} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">E-mail *</span>
          <input
            autoFocus
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="pessoa@exemplo.com"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">Papel</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          >
            <option value="admin">Administrador</option>
            <option value="teacher">Professor</option>
            <option value="staff">Operacional</option>
          </select>
        </label>

        {!inviteUrl ? (
          <ModalActions onCancel={onClose} submitting={false} submitLabel="Gerar link" submitIcon={Send} />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-2)] px-3 py-2 text-xs break-all text-[var(--p-text-muted)]">
              {inviteUrl}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="p-btn p-btn-ghost h-9 px-3 text-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copiado" : "Copiar link"}
              </button>
              <button
                type="button"
                onClick={handleMail}
                className="p-btn p-btn-primary h-9 px-3 text-xs"
              >
                <Mail className="h-3.5 w-3.5" />
                Enviar por e-mail
              </button>
              <button
                type="button"
                onClick={onClose}
                className="ml-auto p-btn p-btn-ghost h-9 px-3 text-xs"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </form>
    </PreviewModal>
  );
}

function Panel({ title, desc, action, children }) {
  return (
    <section className="p-card">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--p-border)] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-[var(--p-text-muted)]">{desc}</p>}
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-4 p-5">{children}</div>
    </section>
  );
}

function Field({ label, value, onChange }) {
  const controlled = typeof onChange === "function";
  return (
    <div className="grid gap-1 sm:grid-cols-[180px_1fr] sm:items-center sm:gap-4">
      <label className="text-xs font-medium text-[var(--p-text-muted)]">{label}</label>
      <input
        {...(controlled ? { value: value ?? "" } : { defaultValue: value })}
        onChange={controlled ? (e) => onChange(e.target.value) : undefined}
        className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
      />
    </div>
  );
}

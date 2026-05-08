// src/app/(app)/configuracoes/page.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Guard from "@/components/Guard";
import { supabase } from "@/lib/supabaseClient";
import { supabaseGateway } from "@/lib/supabaseGateway";
import { useSession } from "@/contexts/SessionContext";
import {
  Building2,
  Palette,
  UserCog,
  LayoutTemplate,
  Code,
  Save,
  ChevronRight,
  Loader2,
  Check,
  Copy,
  Send,
  Mail,
  Upload,
} from "lucide-react";
import AppModal, { FormError, ModalActions } from "@/components/AppModal";

// ─── Helpers visuais ─────────────────────────────────────────────
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
  {
    key: "geral",
    label: "Geral",
    icon: Building2,
    desc: "Nome da marca, subtítulo",
  },
  {
    key: "aparencia",
    label: "Aparência",
    icon: Palette,
    desc: "Logo e cores",
  },
  {
    key: "layout",
    label: "Layout",
    icon: LayoutTemplate,
    desc: "Navegação e densidade",
  },
  {
    key: "usuarios",
    label: "Usuários",
    icon: UserCog,
    desc: "Equipe e convites",
  },
  {
    key: "avancado",
    label: "Avançado",
    icon: Code,
    desc: "Tema e overrides JSON",
  },
];

const DEFAULTS = {
  brand_name: "",
  brand_logo_url: "",
  subtitle: "",
  nav_layout: "vertical",
  sidebar_width: 256,
  header_density: "regular",
  theme: {},
  nav_overrides: [],
};

// ─── Página ──────────────────────────────────────────────────────
export default function ConfiguracoesPage() {
  return (
    <Guard
      fallback={
        <div className="space-y-2 p-6">
          <h1 className="text-lg font-semibold">Acesso negado</h1>
          <p className="text-sm text-[var(--p-text-muted)]">
            Você precisa ser admin para acessar Configurações.
          </p>
        </div>
      }
      check={async () => {
        const { data, error } = await supabase.rpc("is_admin_current_tenant");
        if (error) throw error;
        return !!data;
      }}
    >
      <ConfiguracoesContent />
    </Guard>
  );
}

function ConfiguracoesContent() {
  const { session } = useSession();
  const [active, setActive] = useState("geral");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  // Form state
  const [form, setForm] = useState(DEFAULTS);
  const [themeText, setThemeText] = useState("{}");
  const [navOverridesText, setNavOverridesText] = useState("[]");
  const [jsonErrors, setJsonErrors] = useState({ theme: null, nav: null });

  // Logo upload
  const [uploading, setUploading] = useState(false);
  const logoInputRef = useRef(null);

  // Tenant + members
  const [tenant, setTenant] = useState(null);
  const [members, setMembers] = useState([]);
  const [membersError, setMembersError] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Carrega settings + tenant + membros
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setSaveErr(null);
      setSaveOk(false);
      try {
        // 1) Settings
        const data = await supabaseGateway.getTenantSettings();
        if (!alive) return;
        const next = {
          brand_name: data?.brand_name ?? DEFAULTS.brand_name,
          brand_logo_url: data?.logo_url ?? DEFAULTS.brand_logo_url,
          subtitle: data?.subtitle ?? DEFAULTS.subtitle,
          nav_layout: data?.nav_layout ?? DEFAULTS.nav_layout,
          sidebar_width: Number(data?.sidebar_width ?? DEFAULTS.sidebar_width),
          header_density: data?.header_density ?? DEFAULTS.header_density,
          theme:
            data?.theme && typeof data.theme === "object" ? data.theme : {},
          nav_overrides: Array.isArray(data?.nav_overrides)
            ? data.nav_overrides
            : [],
        };
        setForm(next);
        setThemeText(JSON.stringify(next.theme, null, 2));
        setNavOverridesText(JSON.stringify(next.nav_overrides, null, 2));

        // 2) Tenant + members
        const { data: userRes } = await supabase.auth.getUser();
        const u = userRes?.user || null;
        if (u) {
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
          if (!alive) return;
          setTenant(tn);
          if (tn) {
            try {
              const { data: claims, error: cErr } = await supabase
                .from("user_claims")
                .select(
                  "user_id, role, created_at, user_name_snapshot, user_email_snapshot"
                )
                .eq("tenant_id", tn.id)
                .order("created_at", { ascending: true });
              if (cErr) throw cErr;
              if (!alive) return;
              const rows = (claims || []).map((c) => {
                const isOwner = c.user_id === tn.owner_user_id;
                return {
                  user_id: c.user_id,
                  name:
                    c.user_name_snapshot ||
                    c.user_email_snapshot ||
                    c.user_id,
                  email: c.user_email_snapshot || "",
                  role: isOwner
                    ? "Proprietário"
                    : ROLE_LABEL[c.role] || c.role || "Membro",
                  isCurrent: c.user_id === u.id,
                };
              });
              setMembers(rows);
            } catch (e) {
              if (alive)
                setMembersError(e?.message || String(e));
            }
          }
        }
      } catch (e) {
        if (alive) setSaveErr(e?.message || "Falha ao carregar configurações.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Validar JSON em tempo real
  useEffect(() => {
    try {
      const parsed = themeText.trim() ? JSON.parse(themeText) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setJsonErrors((p) => ({ ...p, theme: null }));
        setForm((f) => ({ ...f, theme: parsed }));
      } else {
        setJsonErrors((p) => ({
          ...p,
          theme: "Deve ser um objeto JSON.",
        }));
      }
    } catch (e) {
      setJsonErrors((p) => ({ ...p, theme: e.message }));
    }
  }, [themeText]);

  useEffect(() => {
    try {
      const parsed = navOverridesText.trim()
        ? JSON.parse(navOverridesText)
        : [];
      if (Array.isArray(parsed)) {
        setJsonErrors((p) => ({ ...p, nav: null }));
        setForm((f) => ({ ...f, nav_overrides: parsed }));
      } else {
        setJsonErrors((p) => ({
          ...p,
          nav: "Deve ser um array JSON.",
        }));
      }
    } catch (e) {
      setJsonErrors((p) => ({ ...p, nav: e.message }));
    }
  }, [navOverridesText]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveErr(null);
    setSaveOk(false);
    try {
      if (jsonErrors.theme || jsonErrors.nav) {
        throw new Error("Corrija os erros de JSON antes de salvar.");
      }
      const payload = {
        logo_url: form.brand_logo_url || null,
        subtitle: form.subtitle || null,
        nav_layout: form.nav_layout || null,
        sidebar_width: Number(form.sidebar_width || 256),
        header_density: form.header_density || null,
        theme: form.theme || {},
        nav_overrides: form.nav_overrides || [],
      };
      const trimmedBrand = (form.brand_name ?? "").trim();
      if (trimmedBrand) payload.brand_name = trimmedBrand;

      await supabaseGateway.upsertTenantSettings(payload);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (e) {
      setSaveErr(e?.message || "Falha ao salvar.");
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
      let tenantId = tenant?.id ?? session?.tenantId;
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
      setField("brand_logo_url", publicUrl);
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

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [members]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--p-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando configurações…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Configurações
          </h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            Ajustes da organização e preferências do sistema.
          </p>
        </div>
        <button
          className="p-btn p-btn-primary self-start sm:self-auto"
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
          <span>{saving ? "Salvando…" : saveOk ? "Salvo" : "Salvar"}</span>
        </button>
      </div>

      {saveErr && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          {saveErr}
        </div>
      )}
      {saveOk && (
        <div className="rounded-lg border border-[var(--p-success)]/30 bg-[var(--p-success-50)] px-4 py-3 text-sm text-[var(--p-success)]">
          Alterações salvas.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr] lg:gap-6">
        {/* Sidebar de seções */}
        <nav className="p-card p-2 self-start">
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
                      isActive
                        ? "bg-[var(--p-primary-50)] text-[var(--p-primary)]"
                        : "text-[var(--p-text)] hover:bg-[var(--p-surface-2)]",
                    ].join(" ")}
                  >
                    <Icon
                      className={`h-4 w-4 ${
                        isActive
                          ? "text-[var(--p-primary)]"
                          : "text-[var(--p-text-muted)]"
                      }`}
                    />
                    <span className="flex-1 truncate">{s.label}</span>
                    <ChevronRight
                      className={`h-3 w-3 transition-opacity ${
                        isActive
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-60"
                      }`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Conteúdo */}
        <div className="flex flex-col gap-4 lg:gap-6">
          {active === "geral" && (
            <Panel
              title="Identidade"
              desc="Nome exibido no painel e nos e-mails enviados."
            >
              <Field
                label="Nome da marca"
                value={form.brand_name}
                onChange={(v) => setField("brand_name", v)}
                placeholder="Fix Idiomas"
              />
              <Field
                label="Subtítulo"
                value={form.subtitle}
                onChange={(v) => setField("subtitle", v)}
                placeholder="Unidade Centro · Desde 2001"
              />
              {/* Pré-visualização */}
              <div className="rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-2)] p-3 flex items-center gap-3">
                {form.brand_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.brand_logo_url}
                    alt="Logo"
                    className="h-10 w-10 rounded-lg object-contain bg-white"
                  />
                ) : (
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-[var(--p-primary)] text-white text-sm font-semibold">
                    {(form.brand_name || "F").trim().charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {form.brand_name?.trim() || "Sua marca"}
                  </div>
                  {form.subtitle?.trim() && (
                    <div className="text-xs text-[var(--p-text-muted)] truncate">
                      {form.subtitle}
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          )}

          {active === "aparencia" && (
            <Panel
              title="Logo & cor"
              desc="Imagem usada no painel e nos materiais. Cor base do tema."
            >
              <div className="flex items-center gap-4">
                {form.brand_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.brand_logo_url}
                    alt="logo"
                    className="h-16 w-16 rounded-xl object-contain shadow-sm bg-white"
                  />
                ) : (
                  <div className="grid h-16 w-16 place-items-center rounded-xl bg-[var(--p-primary)] text-white text-xl font-semibold shadow-sm">
                    {(form.brand_name || "F").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium">Logo atual</div>
                  <div className="text-xs text-[var(--p-text-muted)]">
                    PNG / JPG / SVG · ideal 512×512
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    className="p-btn p-btn-ghost mt-2 h-8 px-3 text-xs"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Enviando…
                      </>
                    ) : (
                      <>
                        <Upload className="h-3 w-3" /> Trocar logo
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-[var(--p-text-muted)]">
                  Cor primária (preview — para customização avançada use Tema)
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    "#8B1C2C",
                    "#E94F37",
                    "#0F766E",
                    "#1E40AF",
                    "#7C3AED",
                    "#18181B",
                  ].map((c) => {
                    const isCurrent = form.theme?.primary === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          const next = { ...(form.theme || {}), primary: c };
                          setField("theme", next);
                          setThemeText(JSON.stringify(next, null, 2));
                        }}
                        className={[
                          "h-9 w-9 rounded-lg border-2 transition-all",
                          isCurrent
                            ? "border-[var(--p-text)] scale-110"
                            : "border-transparent hover:scale-105",
                        ].join(" ")}
                        style={{ background: c }}
                        aria-label={c}
                        title={c}
                      />
                    );
                  })}
                </div>
              </div>
            </Panel>
          )}

          {active === "layout" && (
            <Panel
              title="Navegação"
              desc="Como o menu lateral e o cabeçalho são renderizados."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <SelectField
                  label="Tipo"
                  value={form.nav_layout}
                  onChange={(v) => setField("nav_layout", v)}
                  options={[
                    { value: "vertical", label: "Vertical (sidebar)" },
                    { value: "horizontal", label: "Horizontal (topbar)" },
                  ]}
                />
                <Field
                  label="Largura sidebar (px)"
                  type="number"
                  value={form.sidebar_width}
                  onChange={(v) => setField("sidebar_width", v)}
                  min={160}
                  max={400}
                />
                <SelectField
                  label="Densidade header"
                  value={form.header_density}
                  onChange={(v) => setField("header_density", v)}
                  options={[
                    { value: "regular", label: "Regular" },
                    { value: "compact", label: "Compact" },
                  ]}
                />
              </div>
            </Panel>
          )}

          {active === "usuarios" && (
            <Panel
              title="Equipe"
              desc={
                tenant?.name
                  ? `Membros de ${tenant.name}.`
                  : "Quem tem acesso ao painel."
              }
              action={
                <button
                  className="p-btn p-btn-primary h-9 px-3 text-xs"
                  onClick={() => setInviteOpen(true)}
                >
                  <Send className="h-3.5 w-3.5" />
                  Convidar
                </button>
              }
            >
              {membersError && (
                <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-3 py-2 text-xs text-[var(--p-danger)]">
                  {membersError}
                </div>
              )}
              {sortedMembers.length === 0 ? (
                <div className="text-sm text-[var(--p-text-muted)]">
                  Nenhum membro encontrado.
                </div>
              ) : (
                <ul className="-mx-5 divide-y divide-[var(--p-border)]">
                  {sortedMembers.map((u) => (
                    <li
                      key={u.user_id}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <div
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                        style={{ background: colorFor(u.name || u.email) }}
                      >
                        {initialsFrom(u.name, u.email)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {u.name || "—"}
                        </div>
                        <div className="text-xs text-[var(--p-text-muted)] truncate">
                          {u.email || "—"}
                        </div>
                      </div>
                      <span className="p-chip p-chip-neutral">{u.role}</span>
                      {u.isCurrent && (
                        <span className="p-chip p-chip-success">Você</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {active === "avancado" && (
            <>
              <Panel
                title="Tema (JSON)"
                desc='Sobrescreve tokens de cor e estilo. Ex.: { "primary": "#9b1237" }.'
              >
                <textarea
                  className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
                  rows={8}
                  value={themeText}
                  onChange={(e) => setThemeText(e.target.value)}
                />
                {jsonErrors.theme && (
                  <div className="text-xs text-[var(--p-danger)]">
                    {jsonErrors.theme}
                  </div>
                )}
              </Panel>

              <Panel
                title="Overrides de navegação (JSON)"
                desc='Array de regras por item do menu. Ex.: [ { "key": "financeiro", "hidden": true } ].'
              >
                <textarea
                  className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
                  rows={6}
                  value={navOverridesText}
                  onChange={(e) => setNavOverridesText(e.target.value)}
                />
                {jsonErrors.nav && (
                  <div className="text-xs text-[var(--p-danger)]">
                    {jsonErrors.nav}
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>
      </div>

      {inviteOpen && (
        <InviteModal tenant={tenant} onClose={() => setInviteOpen(false)} />
      )}
    </div>
  );
}

// ─── Modal Convite ───────────────────────────────────────────────
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
    if (!trimmed) {
      setErr("E-mail é obrigatório");
      return;
    }
    if (!tenant?.id) {
      setErr("Tenant não identificado.");
      return;
    }
    const perms = { role };
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${base}/accept-invite?tenant=${encodeURIComponent(
      tenant.id
    )}&perms=${encodeURIComponent(JSON.stringify(perms))}`;
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
    const subject = encodeURIComponent(
      `Convite para ${tenant?.name || "o painel"}`
    );
    const body = encodeURIComponent(
      `Olá,\n\nVocê foi convidado(a) para acessar o painel${
        tenant?.name ? ` de ${tenant.name}` : ""
      }.\n\nAcesse o link abaixo para aceitar o convite:\n\n${inviteUrl}\n\nAté logo!`
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }

  return (
    <AppModal title="Convidar membro" onClose={onClose}>
      <form onSubmit={handleGenerate} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            E-mail *
          </span>
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
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Papel
          </span>
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
          <ModalActions
            onCancel={onClose}
            submitting={false}
            submitLabel="Gerar link"
          />
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
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
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
    </AppModal>
  );
}

// ─── Helpers visuais ─────────────────────────────────────────────
function Panel({ title, desc, action, children }) {
  return (
    <section className="p-card">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--p-border)] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {desc && (
            <p className="mt-0.5 text-xs text-[var(--p-text-muted)]">{desc}</p>
          )}
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-4 p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  type = "text",
  onChange,
  placeholder,
  min,
  max,
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[180px_1fr] sm:items-center sm:gap-4">
      <label className="text-xs font-medium text-[var(--p-text-muted)]">
        {label}
      </label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[var(--p-text-muted)]">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

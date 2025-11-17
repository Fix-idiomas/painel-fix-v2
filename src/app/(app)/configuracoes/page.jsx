// src/app/(app)/configuracoes/page.jsx
"use client";
import { useEffect, useState, useMemo } from "react";
import Guard from "@/components/Guard";
import { supabaseGateway } from "@/lib/supabaseGateway";
import { supabase } from "@/lib/supabaseClient";
import { useSession } from "@/contexts/SessionContext";

const DEFAULTS = {
  // branding
  brand_name: "",
  brand_logo_url: "", // ← interno (preview/envio), sem input de texto
  subtitle: "",
  // navegação/layout
  nav_layout: "vertical",     // "vertical" | "horizontal"
  sidebar_width: 256,         // px
  header_density: "regular",  // "regular" | "compact"
  // tema/overrides
  theme: {},                  // objeto
  nav_overrides: [],          // array
};

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState(null);
  const [ok, setOk]           = useState(null);

  const { session } = useSession();

  const [logoFile, setLogoFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Estado do form (campos reais)
  const [form, setForm] = useState(DEFAULTS);

  // Editores de JSON (textareas com validação)
  const [themeText, setThemeText]               = useState("{}");
  const [navOverridesText, setNavOverridesText] = useState("[]");
  const [jsonErrors, setJsonErrors]             = useState({ theme: null, nav: null });

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Carrega do backend via RPC real
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      setOk(null);
      try {
        const data = await supabaseGateway.getTenantSettings();
        if (!alive) return;

        const next = {
          brand_name:     data?.brand_name ?? DEFAULTS.brand_name,
          brand_logo_url: data?.logo_url ?? DEFAULTS.brand_logo_url, // ← mapeia aqui
          subtitle:       data?.subtitle ?? DEFAULTS.subtitle,

          nav_layout:     data?.nav_layout ?? DEFAULTS.nav_layout,
          sidebar_width:  Number(data?.sidebar_width ?? DEFAULTS.sidebar_width),
          header_density: data?.header_density ?? DEFAULTS.header_density,

          theme:          (data?.theme && typeof data.theme === "object") ? data.theme : {},
          nav_overrides:  Array.isArray(data?.nav_overrides) ? data.nav_overrides : [],
        };

        setForm(next);
        setThemeText(JSON.stringify(next.theme, null, 2));
        setNavOverridesText(JSON.stringify(next.nav_overrides, null, 2));
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Falha ao carregar configurações.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Validar JSON dos textareas ao digitar
  useEffect(() => {
    try {
      const parsed = themeText.trim() ? JSON.parse(themeText) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setJsonErrors((p) => ({ ...p, theme: null }));
        setForm((f) => ({ ...f, theme: parsed }));
      } else {
        setJsonErrors((p) => ({ ...p, theme: "Deve ser um objeto JSON (ex.: { \"primary\": \"#9b1237\" })" }));
      }
    } catch (e) {
      setJsonErrors((p) => ({ ...p, theme: e.message }));
    }
  }, [themeText]);

  useEffect(() => {
    try {
      const parsed = navOverridesText.trim() ? JSON.parse(navOverridesText) : [];
      if (Array.isArray(parsed)) {
        setJsonErrors((p) => ({ ...p, nav: null }));
        setForm((f) => ({ ...f, nav_overrides: parsed }));
      } else {
        setJsonErrors((p) => ({ ...p, nav: "Deve ser um array JSON (ex.: [ {\"key\":\"financeiro\",\"hidden\":true} ])" }));
      }
    } catch (e) {
      setJsonErrors((p) => ({ ...p, nav: e.message }));
    }
  }, [navOverridesText]);

  async function onSubmit(e) {
    e?.preventDefault?.();
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      if (jsonErrors.theme || jsonErrors.nav) {
        throw new Error("Corrija os erros de JSON antes de salvar.");
      }
      const payload = {
        // Envie somente se houver valor não vazio; evita violar NOT NULL no backend
        // brand_name: definido apenas quando preenchido
        logo_url:       form.brand_logo_url || null, // ← mapeia de volta
        subtitle:       form.subtitle || null,
        nav_layout:     form.nav_layout || null,
        sidebar_width:  Number(form.sidebar_width || 256),
        header_density: form.header_density || null,
        theme:          form.theme || {},
        nav_overrides:  form.nav_overrides || [],
      };
      const trimmedBrand = (form.brand_name ?? "").trim();
      if (trimmedBrand) payload.brand_name = trimmedBrand;

      await supabaseGateway.upsertTenantSettings(payload);
      setOk("Configurações salvas.");
    } catch (e) {
      setErr(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // Preview simples do branding
  const brandPreview = useMemo(() => {
    return {
      name:     form.brand_name?.trim() || "Sua marca",
      logo:     form.brand_logo_url?.trim() || "", // ← usa o campo correto do form
      subtitle: form.subtitle?.trim() || "",
    };
  }, [form]);

  // Upload de logo → bucket `branding` (público), salva URL nas settings (logo_url)
  async function uploadLogo() {
    if (!logoFile) return;
    try {
      setUploading(true);

      // tenta obter tenantId da sessão; se não tiver, busca por RPC
      let tenantId = session?.tenantId;
      if (!tenantId) {
        const { data: t, error: te } = await supabase.rpc("current_tenant_id");
        if (te) throw te;
        tenantId = t;
      }
      if (!tenantId) throw new Error("Tenant ausente na sessão.");

      // caminho do arquivo: branding/{tenant}/logo-{timestamp}.{ext}
      const ext  = logoFile.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${tenantId}/logo-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("branding")
        .upload(path, logoFile, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      const publicUrl = data?.publicUrl;
      if (!publicUrl) throw new Error("Falha ao obter URL pública.");

      // atualiza estado local e persiste no settings (logo_url)
      setForm((f) => ({ ...f, brand_logo_url: publicUrl }));

      await supabaseGateway.upsertTenantSettings({
        logo_url: publicUrl, // ← apenas o que mudou já basta
      });

      setOk("Logo enviada e salva.");
    } catch (e) {
      setErr(e?.message || "Falha ao enviar logo.");
    } finally {
      setUploading(false);
    }
  }


// Proteção de rota via RPC real (admin/owner)
  return (
    <Guard
      fallback={
        <main className="p-6">
          <h1 className="text-lg font-semibold mb-1">Acesso negado</h1>
          <p className="text-sm text-slate-600">Você precisa ser admin para acessar Configurações.</p>
        </main>
      }
   check={async () => {
  const { supabase } = await import("@/lib/supabaseClient");
  const { data, error } = await supabase.rpc("is_admin_current_tenant");
  if (error) throw error;
  return !!data;
}}
    >
      <main className="mx-auto max-w-3xl p-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Configurações</h1>
          <p className="text-sm text-slate-600">Preferências da escola (válidas para todo o tenant).</p>
        </header>

        {loading ? (
          <div className="text-sm text-slate-600">Carregando…</div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6">
            {/* Identidade visual */}
            <section className="rounded-xl border p-4 space-y-3">
              <h2 className="text-base font-medium">Identidade visual</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Nome da marca</label>
                  <input
                    type="text"
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={form.brand_name}
                    onChange={(e) => setField("brand_name", e.target.value)}
                    placeholder="Fix Idiomas"
                  />
                  <div className="mt-3 grid gap-2">
  <label className="block text-xs font-medium">Upload de logo (PNG/JPG/SVG)</label>
  <div className="flex items-center gap-2">
    <input
      type="file"
      accept=".png,.jpg,.jpeg,.svg"
      onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
      className="w-full rounded border px-3 py-2 text-sm"
    />
    <button
      type="button"
      onClick={uploadLogo}
      disabled={!logoFile || uploading}
      className="rounded border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
      title="Enviar para o Storage"
    >
      {uploading ? "Enviando…" : "Enviar"}
    </button>
  </div>

  {/* Preview opcional */}
  {form.brand_logo_url && (
    <div className="mt-2">
      <span className="block text-[11px] text-slate-500 mb-1">Pré-visualização</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={form.brand_logo_url}
        alt="Logo do tenant"
        className="h-10 object-contain"
      />
    </div>
  )}
</div>
                </div>
                </div>
              <div>
                <label className="block text-xs font-medium mb-1">Subtítulo</label>
                <input
                  type="text"
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={form.subtitle}
                  onChange={(e) => setField("subtitle", e.target.value)}
                  placeholder="Unidade Centro • Desde 2001"
                />
              </div>

              {/* Preview */}
              <div className="mt-3 rounded-lg border p-3 flex items-center gap-3">
                {brandPreview.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brandPreview.logo} alt="Logo" className="h-10 w-10 object-contain" />
                ) : (
                  <div className="h-10 w-10 rounded bg-gray-200" />
                )}
                <div className="min-w-0">
                  <div className="font-medium truncate">{brandPreview.name}</div>
                  {brandPreview.subtitle && (
                    <div className="text-xs text-slate-600 truncate">{brandPreview.subtitle}</div>
                  )}
                </div>
              </div>
            </section>

            {/* Layout de navegação */}
            <section className="rounded-xl border p-4 space-y-3">
              <h2 className="text-base font-medium">Layout de navegação</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Tipo</label>
                  <select
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={form.nav_layout}
                    onChange={(e) => setField("nav_layout", e.target.value)}
                  >
                    <option value="vertical">Vertical (sidebar)</option>
                    <option value="horizontal">Horizontal (topbar)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Largura da sidebar (px)</label>
                  <input
                    type="number"
                    min={160}
                    max={400}
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={form.sidebar_width}
                    onChange={(e) => setField("sidebar_width", e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Densidade do header</label>
                  <select
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={form.header_density}
                    onChange={(e) => setField("header_density", e.target.value)}
                  >
                    <option value="regular">Regular</option>
                    <option value="compact">Compact</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Tema (JSON) */}
            <section className="rounded-xl border p-4 space-y-3">
              <h2 className="text-base font-medium">Tema (JSON)</h2>
              <p className="text-xs text-slate-600">
                Objeto com chaves de tema. Ex.: {"{ \"primary\": \"#9b1237\", \"surface\":\"#ffffff\" }"}
              </p>
              <textarea
                className="font-mono w-full rounded border px-3 py-2 text-sm"
                rows={8}
                value={themeText}
                onChange={(e) => setThemeText(e.target.value)}
              />
              {jsonErrors.theme && <div className="text-xs text-rose-700">{jsonErrors.theme}</div>}
            </section>

            {/* Overrides de navegação (JSON) */}
            <section className="rounded-xl border p-4 space-y-3">
              <h2 className="text-base font-medium">Overrides de navegação (JSON)</h2>
              <p className="text-xs text-slate-600">
                Array de regras por item. Ex.: [{"{ \"key\": \"financeiro\", \"hidden\": true }"}]
              </p>
              <textarea
                className="font-mono w-full rounded border px-3 py-2 text-sm"
                rows={6}
                value={navOverridesText}
                onChange={(e) => setNavOverridesText(e.target.value)}
              />
              {jsonErrors.nav && <div className="text-xs text-rose-700">{jsonErrors.nav}</div>}
            </section>

            {/* Ações / feedback */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="rounded border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
                disabled={saving}
              >
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
              {ok && <span className="text-sm text-green-700">{ok}</span>}
              {err && <span className="text-sm text-rose-700">{err}</span>}
            </div>
          </form>
        )}
      </main>
    </Guard>
  );
}
//bora
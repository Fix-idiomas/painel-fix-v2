// src/app/(app)/configuracoes/page.jsx
"use client";

import { useEffect, useState, useMemo } from "react";
import Guard from "@/components/Guard";
import { supabaseGateway } from "@/lib/supabaseGateway";

// Campos reais aceitos por upsert_tenant_settings(payload jsonb)
const DEFAULTS = {
  brand_name: "",
  logo_url: "",
  subtitle: "",
  nav_layout: "vertical",        // 'vertical' | 'horizontal'
  sidebar_width: 256,            // 160..400 (guard no gateway)
  header_density: "regular",     // 'regular' | 'compact' (livre)
  theme: {},                     // json object
  nav_overrides: [],             // json array
};

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState(null);
  const [ok, setOk]           = useState(null);

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
          brand_name: data?.brand_name ?? DEFAULTS.brand_name,
          logo_url: data?.logo_url ?? DEFAULTS.logo_url,
          subtitle: data?.subtitle ?? DEFAULTS.subtitle,
          nav_layout: data?.nav_layout ?? DEFAULTS.nav_layout,
          sidebar_width: Number(data?.sidebar_width ?? DEFAULTS.sidebar_width),
          header_density: data?.header_density ?? DEFAULTS.header_density,
          theme: (data?.theme && typeof data.theme === "object") ? data.theme : {},
          nav_overrides: Array.isArray(data?.nav_overrides) ? data.nav_overrides : [],
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
      await supabaseGateway.upsertTenantSettings({
        brand_name: form.brand_name || null,
        logo_url: form.logo_url || null,
        subtitle: form.subtitle || null,
        nav_layout: form.nav_layout || null,
        sidebar_width: Number(form.sidebar_width || 256),
        header_density: form.header_density || null,
        theme: form.theme || {},
        nav_overrides: form.nav_overrides || [],
      });
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
      name: form.brand_name?.trim() || "Sua marca",
      logo: form.logo_url?.trim() || "",
      subtitle: form.subtitle?.trim() || "",
    };
  }, [form]);

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
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Logo (URL)</label>
                  <input
                    type="url"
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={form.logo_url}
                    onChange={(e) => setField("logo_url", e.target.value)}
                    placeholder="https://…/logo.png"
                  />
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

import { supabase } from "../supabaseClient";
import type { TenantSettings } from "@/types";

export const settingsGateway = {
  async getTenantSettings(): Promise<Partial<TenantSettings>> {
    const { data, error } = await supabase.rpc("get_tenant_settings");
    if (error) throw new Error(`getTenantSettings: ${error.message}`);
    return (data || {}) as Partial<TenantSettings>;
  },

  async upsertTenantSettings(payload: Partial<TenantSettings> = {}): Promise<true> {
    const clean: Record<string, unknown> = {};
    if (payload.brand_name !== undefined)
      clean.brand_name = String(payload.brand_name || "").trim() || null;
    if (payload.logo_url !== undefined)
      clean.logo_url = String(payload.logo_url || "").trim() || null;
    if (payload.subtitle !== undefined)
      clean.subtitle = String(payload.subtitle || "").trim() || null;

    if ((payload as Record<string, unknown>).nav_layout !== undefined) {
      const v = String((payload as Record<string, unknown>).nav_layout || "").trim().toLowerCase();
      clean.nav_layout = v || null;
    }

    if (payload.sidebar_width !== undefined) {
      const n = Number(payload.sidebar_width);
      clean.sidebar_width = Number.isFinite(n) ? Math.max(160, Math.min(400, Math.trunc(n))) : null;
    }

    if (payload.header_density !== undefined) {
      const d = String(payload.header_density || "").trim().toLowerCase();
      clean.header_density = d || null;
    }

    if (payload.theme !== undefined) {
      const t = payload.theme;
      clean.theme = t && typeof t === "object" ? t : {};
    }

    if (payload.nav_overrides !== undefined) {
      const n = payload.nav_overrides;
      clean.nav_overrides = Array.isArray(n) ? n : [];
    }

    const { error } = await supabase.rpc("upsert_tenant_settings", { payload: clean });
    if (error) throw new Error(`upsertTenantSettings: ${error.message}`);
    return true;
  },
};

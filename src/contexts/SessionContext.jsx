// src/contexts/SessionContext.jsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient"; // <- usa o seu client anon

const STORAGE_KEY = "pf.session.ui"; // só prefs de UI; nada de perms/role "falsos"

const FULL_PERMS = {
  finance: { read: true, write: true },
  classes: { read: true, write: true },
};

// ---- Normalização a partir do DB (não inventa role/perms)
function fromDbToSession({ user, tenantId, claim, isOwner, teacherId, tenantName }) {
  const role = isOwner ? "owner" : (claim?.role ?? "member");
  const perms = role === "owner" || role === "admin"
    ? FULL_PERMS
    : {
        finance: {
          read: !!claim?.perms?.finance?.read,
          write: !!claim?.perms?.finance?.write,
        },
        classes: {
          read: !!claim?.perms?.classes?.read,
          write: !!claim?.perms?.classes?.write,
        },
      };

  return {
    userId: user?.id ?? null,
    name: user?.user_metadata?.name ?? user?.email ?? "Usuário",
    role, // "owner" | "admin" | "member"
    teacherId: teacherId ?? null,
    tenantId: tenantId ?? null,
    tenantName: tenantName ?? "Fix Idiomas",
    perms,
  };
}

// ---------- Defaults (usados só até o DB responder) ----------
const DEFAULT_SESSION = {
  userId: null,
  role: "member",
  teacherId: null,
  name: "Usuário",
  tenantId: null,
  tenantName: "Fix Idiomas",
  perms: { finance: { read: false, write: false }, classes: { read: false, write: false } },
};

// ---------- Role presets (dev only) ----------
const ROLE_PRESETS = {
  owner:  { role: "owner"  },
  admin:  { role: "admin"  },
  member: { role: "member" },
};

// Hidrata a sessão a partir do DB (fonte da verdade). Reutilizada no mount e
// em mudanças de autenticação. Retorna a sessão normalizada ou null (sem usuário).
async function hydrateFromDb(prevTenantName) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // tenant atual (sempre do DB)
  const { data: tenantId } = await supabase.rpc("current_tenant_id");

  // claim do usuário no tenant
  let claim = null;
  if (tenantId) {
    const { data: c } = await supabase
      .from("user_claims")
      .select("tenant_id, user_id, role, perms, user_email_snapshot, user_name_snapshot")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    claim = c ?? null;
  }

  // opcional: teacherId
  let teacherId = null;
  try {
    const { data: tid } = await supabase.rpc("current_teacher_id");
    teacherId = tid ?? null;
  } catch { /* ignore */ }

  // opcional: owner (RPC correta — NÃO usar is_admin_or_owner, que elevaria admin a owner)
  let isOwner = false;
  try {
    const { data: ownerOk } = await supabase.rpc("is_owner_current_tenant");
    isOwner = ownerOk === true;
  } catch { /* ignore */ }

  return fromDbToSession({ user, tenantId, claim, isOwner, teacherId, tenantName: prevTenantName });
}

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  // 1) Hidrata apenas preferências de UI (sem roles/perms falsos)
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : {};
      // Por enquanto só garantimos tenantName preferido (se você salva isso)
      setSession((prev) => ({
        ...(prev ?? DEFAULT_SESSION),
        tenantName: parsed.tenantName ?? DEFAULT_SESSION.tenantName,
      }));
    } catch {
      setSession((prev) => prev ?? { ...DEFAULT_SESSION });
    }
  }, []);

  // 2) Carrega usuário + tenant + claim do DB (fonte da verdade) no mount E a
  //    cada mudança de autenticação (login/logout/refresh de token).
  useEffect(() => {
    let active = true;

    async function refresh() {
      setReady(false);
      try {
        const next = await hydrateFromDb(session?.tenantName);
        if (active) setSession(next);
      } finally {
        if (active) setReady(true);
      }
    }

    refresh(); // hidratação inicial

    // INITIAL_SESSION é ignorado para não duplicar a hidratação do mount.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION") return;
      refresh();
    });

    return () => {
      active = false;
      sub.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3) Persistir só prefs de UI (ex.: tenantName). Nada de role/perms aqui.
  useEffect(() => {
    if (!ready || !session) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tenantName: session.tenantName }));
    } catch { /* noop */ }
  }, [session, ready]);

  const value = useMemo(() => {
    const s = session ?? DEFAULT_SESSION;

    // helpers calculados a partir da sessão já normalizada pelo DB
    const isOwner = s.role === "owner";
    const isAdmin = s.role === "owner" || s.role === "admin";
    const perms = s.perms ?? {};

    return {
      session: s,
      ready,
      setSession,

      isOwner,
      isAdmin,
      perms,

      // Dev only: trocar "rótulo" de role para testes locais, sem afetar DB
      switchRole(next) {
        if (process.env.NODE_ENV === "production") return; // no-op em prod
        const patch = ROLE_PRESETS[next] ?? ROLE_PRESETS.admin;
        setSession((prev) => ({ ...(prev ?? DEFAULT_SESSION), ...patch }));
      },

      // Troca de tenant (apenas label). O tenant *real* é do DB (current_tenant_id)
      switchTenant(nextTenant) {
        if (!nextTenant) return;
        setSession((prev) => {
          const base = prev ?? DEFAULT_SESSION;
          if (typeof nextTenant === "string") {
            return { ...base, tenantName: base.tenantName }; // id real vem do DB
          }
          return {
            ...base,
            tenantName: nextTenant.tenantName ?? base.tenantName,
          };
        });
      },

      resetSession() {
        setSession({ ...DEFAULT_SESSION });
      },
    };
  }, [session, ready]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

// src/contexts/SessionContext.jsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "pf.session";

const FULL_PERMS = {
   finance: { read: true, write: true },
   classes: { read: true, write: true },
};

// migra/normaliza tenant e campos essenciais
function normalizeSession(raw) {
  const s = typeof raw === "object" && raw ? raw : {};
  const tenantId = s.tenantId ?? null;
  const role = s.role ?? "owner"; // default local pode ser owner para facilitar testes
  const rawPerms = s.perms || {};

  const perms =
    role === "owner" || role === "admin"
      ? FULL_PERMS
      : {
          finance: {
            read: !!rawPerms?.finance?.read,
            write: !!rawPerms?.finance?.write,
          },
          classes: {
            read: !!rawPerms?.classes?.read,
            write: !!rawPerms?.classes?.write,
          },
        };

   return {
    userId: s.userId ?? "dev-admin",
    role,
    teacherId: s.teacherId ?? null,
    name: s.name ?? "Administrador (dev)",
    tenantId,
    tenantName: s.tenantName ?? "Fix Idiomas",
    perms,
  };
}


// ---------- Defaults ----------
const DEFAULT_SESSION = normalizeSession({
  userId: "dev-owner",
  role: "owner",
  teacherId: null,
  name: "Owner (dev)",
  tenantId: null,
  tenantName: "Fix Idiomas",
});

// ---------- Role presets (dev only) ----------
const ROLE_PRESETS = {
  owner: {
    userId: "dev-owner",
    role: "owner",
    teacherId: null,
    name: "Owner (dev)",
  },
  admin: {
    userId: "dev-admin",
    role: "admin",
    teacherId: null,
    name: "Administrador (dev)",
  },
};
const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  // SSR-safe: inicia null e hidrata no client
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  // Hidratação do localStorage
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : DEFAULT_SESSION;
      setSession(normalizeSession(parsed));
    } catch {
      setSession(DEFAULT_SESSION);
    } finally {
      setReady(true);
    }
  }, []);

  // Persistência pós-hidratação
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      /* noop */
    }
  }, [session, ready]);

  // Promove admin → owner se o banco confirmar que este usuário é o owner do tenant
  useEffect(() => {
    if (!ready) return;
    if (session?.role !== "admin") return;

    (async () => {
      try {
        const { supabase } = await import("@/lib/supabaseClient");
        const { data: ownerOk, error } = await supabase.rpc("is_owner");
        if (!error && ownerOk === true) {
          setSession((prev) => normalizeSession({ ...prev, role: "owner" }));
        }
      } catch {
        /* mantém como admin se falhar */
      }
    })();
  }, [ready, session?.role]);

  const value = useMemo(
    () => ({
      session,
      ready,
      setSession,

      // helpers prontos para a UI
      isOwner: session?.role === "owner",
      isAdmin: session?.role === "owner" || session?.role === "admin",
      perms: session?.perms ?? {},

      // Troca de papel preservando tenant atual (dev only)
      switchRole(next) {
        const patch = ROLE_PRESETS[next] ?? ROLE_PRESETS.admin;
        setSession((prev) => {
          const base = normalizeSession(prev ?? DEFAULT_SESSION);
          return normalizeSession({
            ...base,
            ...patch,
            tenantId: base.tenantId,    // preserva
            tenantName: base.tenantName // preserva
          });
        });
      },

      // Aceita string UUID ou objeto { tenantId, tenantName }
      switchTenant(nextTenant) {
        if (!nextTenant) return;
        setSession((prev) => {
          const base = normalizeSession(prev ?? DEFAULT_SESSION);

          if (typeof nextTenant === "string") {
            return normalizeSession({
              ...base,
              tenantId: nextTenant,
              tenantName: base.tenantName, // preserva se só veio id
            });
          }

          return normalizeSession({
            ...base,
            tenantId: nextTenant.tenantId ?? base.tenantId,
            tenantName: nextTenant.tenantName ?? base.tenantName,
          });
        });
      },

      // Utilitário opcional para reset rápido (dev)
      resetSession() {
        setSession(DEFAULT_SESSION);
      },
    }),
    [session, ready]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}


export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

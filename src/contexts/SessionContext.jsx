// src/contexts/SessionContext.jsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "pf.session";

const DEFAULT_SESSION = {
  userId: "dev-admin",
  role: "admin", // "admin" | "professor" | "financeiro"
  teacherId: null,
  name: "Administrador (dev)",
  tenantId: "tenant-fix",
  tenantName: "Fix Idiomas",
};

const ROLE_PRESETS = {
  admin: {
    userId: "dev-admin",
    role: "admin",
    teacherId: null,
    name: "Administrador (dev)",
  },
  professor: {
    userId: "dev-teacher-001",
    role: "professor",
    teacherId: "teacher-001", // ajuste conforme seus seeds
    name: "Prof. Alice (dev)",
  },
  financeiro: {
    userId: "dev-fin-001",
    role: "financeiro",
    teacherId: null,
    name: "Financeiro (dev)",
  },
};

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  // 👇 SSR-safe: começa sem sessão e hidrata no cliente
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  // Hidrata do localStorage apenas no client
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const initial = raw ? JSON.parse(raw) : DEFAULT_SESSION;
      setSession(initial);
    } catch {
      setSession(DEFAULT_SESSION);
    } finally {
      setReady(true);
    }
  }, []);

  // Persiste após hidratar
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {}
  }, [session, ready]);

  const value = useMemo(
    () => ({
      session,
      ready,
      setSession,
      switchRole(next) {
        const patch = ROLE_PRESETS[next] ?? ROLE_PRESETS.admin;
        setSession((prev) => ({
          ...(prev ?? DEFAULT_SESSION),
          ...patch,
          // preserva tenant atual ao trocar de papel
          tenantId: prev?.tenantId ?? DEFAULT_SESSION.tenantId,
          tenantName: prev?.tenantName ?? DEFAULT_SESSION.tenantName,
        }));
      },
      // aceita objeto {tenantId, tenantName} ou string tenantId
      switchTenant(nextTenant) {
        if (!nextTenant) return;
        if (typeof nextTenant === "string") {
          setSession((prev) => ({
            ...(prev ?? DEFAULT_SESSION),
            tenantId: nextTenant,
            tenantName: prev?.tenantName ?? DEFAULT_SESSION.tenantName,
          }));
        } else {
          setSession((prev) => ({
            ...(prev ?? DEFAULT_SESSION),
            tenantId: nextTenant.tenantId,
            tenantName: nextTenant.tenantName,
          }));
        }
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

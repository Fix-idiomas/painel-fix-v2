// src/contexts/SessionContext.jsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "pf.session";

// ---------- Helpers ----------
const DEV_TENANT_ID = "11111111-1111-4111-8111-111111111111";
const isUuid = (s) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

// migra/normaliza tenant e campos essenciais
function normalizeSession(raw) {
  const s = typeof raw === "object" && raw ? raw : {};
  let tenantId = s.tenantId;

  // migração: se vier "tenant-fix" ou algo inválido, força UUID de dev
  if (!isUuid(tenantId)) tenantId = DEV_TENANT_ID;

  return {
    userId: s.userId ?? "dev-admin",
    role: s.role ?? "admin", // "admin" | "professor" | "financeiro"
    teacherId: s.teacherId ?? null,
    name: s.name ?? "Administrador (dev)",
    tenantId,
    tenantName: s.tenantName ?? "Fix Idiomas",
  };
}

// ---------- Defaults ----------
const DEFAULT_SESSION = normalizeSession({
  userId: "dev-admin",
  role: "admin",
  teacherId: null,
  name: "Administrador (dev)",
  tenantId: DEV_TENANT_ID,
  tenantName: "Fix Idiomas",
});

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

  const value = useMemo(
    () => ({
      session,
      ready,
      setSession,

      // Troca de papel preservando tenant atual
      switchRole(next) {
        const patch = ROLE_PRESETS[next] ?? ROLE_PRESETS.admin;
        setSession((prev) => {
          const base = normalizeSession(prev ?? DEFAULT_SESSION);
          return normalizeSession({
            ...base,
            ...patch,
            tenantId: base.tenantId, // preserva
            tenantName: base.tenantName, // preserva
          });
        });
      },

      // Aceita string UUID ou objeto { tenantId, tenantName }
      switchTenant(nextTenant) {
        if (!nextTenant) return;
        setSession((prev) => {
          const base = normalizeSession(prev ?? DEFAULT_SESSION);

          if (typeof nextTenant === "string") {
            const tid = isUuid(nextTenant) ? nextTenant : DEV_TENANT_ID;
            return normalizeSession({
              ...base,
              tenantId: tid,
              // preserva tenantName se só veio id
              tenantName: base.tenantName,
            });
          }

          return normalizeSession({
            ...base,
            tenantId: isUuid(nextTenant.tenantId) ? nextTenant.tenantId : DEV_TENANT_ID,
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

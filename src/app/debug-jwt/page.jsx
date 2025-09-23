"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function DebugJWTPage() {
  const [state, setState] = useState({
    loading: true,
    userId: null,
    tenantFromJwt: null,
    roleFromJwt: null,
    error: null,
  });

  useEffect(() => {
    (async () => {
      try {
        // 1) Quem está logado?
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;

        const uid = userData?.user?.id || null;

        // 2) Lê as funções do banco (que dependem do JWT real do usuário)
        const { data: tenantData, error: tenantErr } = await supabase.rpc("current_tenant_id");
        if (tenantErr) throw tenantErr;

        const { data: roleData, error: roleErr } = await supabase.rpc("current_role");
        if (roleErr) throw roleErr;

        setState({
          loading: false,
          userId: uid,
          tenantFromJwt: tenantData ?? null,
          roleFromJwt: roleData ?? null,
          error: null,
        });
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e?.message || String(e) }));
      }
    })();
  }, []);

  if (state.loading) return <div className="p-6">Carregando…</div>;

  return (
    <div className="p-6 space-y-3">
      <h1 className="text-xl font-semibold">Debug JWT</h1>
      <div><strong>userId:</strong> {state.userId || "—"}</div>
      <div><strong>current_tenant_id():</strong> {state.tenantFromJwt || "NULL"}</div>
      <div><strong>current_role():</strong> {state.roleFromJwt || "NULL"}</div>
      {state.error && (
        <pre className="mt-4 p-3 bg-gray-100 rounded border text-sm whitespace-pre-wrap">
          {state.error}
        </pre>
      )}
      <p className="text-sm text-gray-500">
        Abra esta página estando logado como o usuário que quer testar.
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function DebugPaymentsPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        // 1) Descobre o tenant real do JWT
        const { data: tenantData, error: tenantErr } = await supabase.rpc("current_tenant_id");
        if (tenantErr) throw tenantErr;
        setTenant(tenantData || null);

        // 2) Busca payments SEM JOIN e SEM filtros extras (deixe o RLS trabalhar)
        const { data, error } = await supabase
          .from("payments")
          .select("id, tenant_id, status, due_date")
          .limit(20);

        if (error) throw error;
        setRows(data || []);
      } catch (e) {
        setError(e?.message || String(e));
        setRows([]);
      }
    })();
  }, []);

  if (!rows && !error) return <div className="p-6">Carregando…</div>;

  return (
    <div className="p-6 space-y-3">
      <h1 className="text-xl font-semibold">Debug Payments (RLS puro)</h1>
      <div><strong>current_tenant_id():</strong> {tenant || "NULL"}</div>
      {error && (
        <pre className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-sm whitespace-pre-wrap">
          {error}
        </pre>
      )}
      <div><strong>rows:</strong> {rows?.length ?? 0}</div>
      <ul className="mt-2 space-y-1 text-sm">
        {rows?.map(r => (
          <li key={r.id} className="p-2 border rounded">
            <div><b>id:</b> {r.id}</div>
            <div><b>tenant_id:</b> {r.tenant_id}</div>
            <div><b>status:</b> {r.status}</div>
            <div><b>due_date:</b> {r.due_date}</div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-500">
        Esta página consulta direto a tabela, sem JOINs, para isolar o efeito do RLS.
      </p>
    </div>
  );
}

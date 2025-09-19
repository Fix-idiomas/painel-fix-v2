"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function DebugClaimsPage() {
  const [me, setMe] = useState(null);
  const [claims, setClaims] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setMe(u?.user || null);

      // tenta ler minhas claims
      const { data, error } = await supabase
        .from("user_claims")
        .select("user_id, tenant_id, role, perms")
        .order("tenant_id");
      if (error) setError(error.message);
      else setClaims(data || []);
    })();
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h1>Debug Claims</h1>
      <pre>user: {me?.id || "(deslogado)"}</pre>
      {error && <pre style={{ color: "crimson" }}>error: {error}</pre>}
      <pre>{JSON.stringify(claims, null, 2)}</pre>
    </div>
  );
}

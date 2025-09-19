// src/app/accept-invite/page.jsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AcceptInvitePage() {
  const [status, setStatus] = useState("Preparando…");

  useEffect(() => {
    (async () => {
      try {
        // 1) garantir login
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          // guarda params e manda para login
          localStorage.setItem("invite_query", window.location.search);
          window.location.href = "/login?next=/accept-invite";
          return;
        }

        // 2) recuperar params (da URL ou do localStorage)
        const qs =
          window.location.search ||
          localStorage.getItem("invite_query") ||
          "";
        const sp = new URLSearchParams(qs);
        const tenant = sp.get("tenant");
        const permsStr = sp.get("perms");

        if (!tenant || !permsStr) {
          setStatus("Convite inválido: faltam parâmetros.");
          return;
        }

        // 3) parse de perms
        let perms = {};
        try {
          perms = JSON.parse(decodeURIComponent(permsStr));
        } catch {
          setStatus("Convite inválido: PERMS corrompido.");
          return;
        }

        // 4) aplicar claim (role 'user', perms do convite)
        setStatus("Aplicando permissões…");
        const { error } = await supabase
          .from("user_claims")
          .upsert(
            {
              user_id: auth.user.id,
              tenant_id: tenant,
              role: "user",
              perms,
            },
            { onConflict: "tenant_id,user_id" }
          )
          .select()
          .single();

        if (error) throw error;

        // limpar stash e ir para home
        localStorage.removeItem("invite_query");
        setStatus("Convite aceito! Redirecionando…");
        setTimeout(() => (window.location.href = "/"), 800);
      } catch (e) {
        console.error(e);
        setStatus("Falha ao aceitar convite.");
      }
    })();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-2">Aceitar Convite</h1>
      <p className="text-sm text-gray-600">{status}</p>
    </div>
  );
}

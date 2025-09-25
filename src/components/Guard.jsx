"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/contexts/SessionContext";

/**
 * Guard híbrido: pode usar roles (sessão) e/ou checagem assíncrona (DB-first).
 *
 * Uso clássico (compatível):
 *   <Guard roles={["admin","financeiro"]}><Conteudo/></Guard>
 *
 * Uso DB-first (RPC):
 *   <Guard
 *     fallback={<AcessoNegado area="Gastos" />}
 *     check={async () => {
 *       // ex.: Supabase RPC que retorna boolean
 *       const { supabase } = await import("@/lib/supabaseClient");
 *       const { data, error } = await supabase.rpc("is_admin_or_finance_read", {});
 *       if (error) throw error;
 *       return !!data;
 *     }}
 *   >
 *     <Conteudo/>
 *   </Guard>
 *
 * Quando ambos são fornecidos (roles + check), exige PASSAR nos dois.
 */
export default function Guard({ roles, check, fallback = null, children }) {
  const { session } = useSession();

  // 1) sessão ainda não carregou → não renderiza nada (evita flicker)
  if (!session) return null;

  // 2) checagem por roles (opcional)
  const allowedByRole = Array.isArray(roles) ? roles.includes(session.role) : true;

  // 3) checagem assíncrona (opcional, DB-first)
  const [checked, setChecked] = useState(!check);   // se não houver check, já consideramos ok
  const [allowedByCheck, setAllowedByCheck] = useState(true);
  const [checkError, setCheckError] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!check) return; // não há checagem extra

    (async () => {
      try {
        setCheckError(null);
        const ok = await check(); // deve retornar boolean
        if (!alive) return;
        setAllowedByCheck(!!ok);
      } catch (e) {
        if (!alive) return;
        // Em caso de erro na RPC, trate como negado (e exponha erro se quiser)
        setAllowedByCheck(false);
        setCheckError(e?.message || "Falha na verificação de permissão.");
      } finally {
        if (alive) setChecked(true);
      }
    })();

    return () => { alive = false; };
  }, [check]);

  // 4) enquanto aguardamos a checagem DB-first, não renderizar children
  if (!checked) return null;

  // 5) decisão final: precisa passar em ambos quando ambos existem
  const allowed = allowedByRole && allowedByCheck;

  if (!allowed) {
    // você pode optar por expor o erro de permissão aqui, se desejar:
    // if (checkError) console.warn("Guard check error:", checkError);
    return (
      fallback ?? (
        <main className="p-6">
        <h1 className="text-xl font-semibold mb-2">Acesso negado</h1>
        <p className="text-sm opacity-75">
          Você não tem permissão para acessar esta área.
        </p>
      </main>
      )
    );
  }

  return <>{children}</>;
}

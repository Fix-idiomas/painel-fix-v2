// app/(app)/cadastro/layout.jsx
"use client";
import Guard from "@/components/Guard";
import { supabase } from "@/lib/supabaseClient";

export default function CadastroLayout({ children }) {
  return (
    <Guard
      check={async () => {
        const [{ data: canReg }, { data: isOwner }] = await Promise.all([
          supabase.rpc("can_registry_read"),          // ✅ existe sem args
          supabase.rpc("is_owner_current_tenant"),    // ✅ opcional: owner passa
        ]);
        return !!canReg || !!isOwner;
      }}
      fallback={
        <main className="p-6">
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Acesso negado</h1>
          <p className="text-sm text-slate-600">
            Você não tem permissão para visualizar <b>Cadastros</b> desta escola.
          </p>
        </main>
      }
    >
      {children}
    </Guard>
  );
}

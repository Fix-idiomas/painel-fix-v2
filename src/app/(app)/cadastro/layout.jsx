"use client";
import Guard from "@/components/Guard";
import { supabase } from "@/lib/supabaseClient";

export default function CadastroLayout({ children }) {
  return (
    <Guard
      check={async () => {
        // checagem estrita por tenant
        const { data: tenant } = await supabase.rpc("current_tenant_id");
        if (!tenant) return false;
        const { data: canReg } = await supabase.rpc("is_admin_or_registry_read", { p_tenant: tenant });
        return !!canReg;

        // Se quiser liberar também o "owner", (opcional) faça:
        // const { data: isOwner } = await supabase.rpc("is_owner_current_tenant");
        // return !!canReg || !!isOwner;
      }}
      fallback={
        <div className="space-y-2 p-6">
          <h1 className="text-xl font-semibold">Acesso negado</h1>
          <p className="text-sm text-[var(--p-text-muted)]">
            Você não tem permissão para visualizar <b>Cadastros</b> desta escola.
          </p>
        </div>
      }
    >
      {children}
    </Guard>
  );
}

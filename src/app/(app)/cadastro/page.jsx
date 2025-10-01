// src/app/(app)/cadastro/page.jsx
"use client";

import Link from "next/link";
import Guard from "@/components/Guard";
import { supabase } from "@/lib/supabaseClient";

export default function CadastrosHubPage() {
  const itens = [
    { href: "/cadastro/alunos",       label: "Alunos",       desc: "Gerenciar alunos ativos e inativos" },
    { href: "/cadastro/professores",  label: "Professores",  desc: "Gerenciar corpo docente" },
    { href: "/cadastro/pagadores",    label: "Pagadores",    desc: "Responsáveis financeiros" },
  ];

  return (
    <Guard
      // DB-first: Postgres decide; evita confiar só no front
      check={async () => {
        const { data: canReg, error: e1 } = await supabase.rpc("can_registry_read");
        if (e1) throw e1;
        return !!canReg; // sua função já deve considerar admin/owner; se não considerar, troque por is_admin_current_tenant OR can_registry_read
      }}
      fallback={
        <main className="p-6">
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Acesso negado</h1>
          <p className="text-sm text-slate-600">
            Você não tem permissão para visualizar <b>Cadastros</b>.
          </p>
        </main>
      }
    >
      <main className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Hub de Cadastros</h1>
        <p className="text-slate-600">
          Escolha um dos módulos abaixo para gerenciar os cadastros do sistema.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {itens.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false} // evita prefetch antes da checagem do Guard
              className="block border rounded-lg p-4 hover:shadow transition"
            >
              <div className="text-lg font-semibold text-rose-700">{item.label}</div>
              <div className="text-sm text-slate-600">{item.desc}</div>
            </Link>
          ))}
        </div>
      </main>
    </Guard>
  );
}
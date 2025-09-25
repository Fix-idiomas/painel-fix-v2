// app/(app)/cadastros/page.jsx
"use client";

import Link from "next/link";
import Guard from "@/components/Guard";
import { supabase } from "@/lib/supabaseClient";

export default function CadastrosHubPage() {
  const itens = [
    { href: "/alunos",      label: "Alunos",      desc: "Gerenciar alunos ativos e inativos" },
    { href: "/professores", label: "Professores", desc: "Gerenciar corpo docente" },
    { href: "/pagadores",   label: "Pagadores",   desc: "Responsáveis financeiros" },
  ];

  return (
    <Guard
      // DB-first: Postgres decide; sem depender de roles no front
      check={async () => {
        const [{ data: canReg, error: e1 }, { data: isOwner, error: e2 }] = await Promise.all([
          supabase.rpc("can_registry_read"),          // ✅ existe sem argumentos
          supabase.rpc("is_owner_current_tenant"),    // ✅ opcional: owner tem passe-livre
        ]);
        if (e1 || e2) return !!canReg;               // se a de owner falhar, ao menos respeita canReg
        return !!canReg || !!isOwner;
      }}

      // Mensagem padronizada de acesso negado
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

"use client";

import Link from "next/link";

export default function CadastrosHubPage() {
  const itens = [
    { href: "/alunos", label: "Alunos", desc: "Gerenciar alunos ativos e inativos" },
    { href: "/professores", label: "Professores", desc: "Gerenciar corpo docente" },
    { href: "/pagadores", label: "Pagadores", desc: "Responsáveis financeiros" },
  ];

  return (
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
            className="block border rounded-lg p-4 hover:shadow transition"
          >
            <div className="text-lg font-semibold text-rose-700">{item.label}</div>
            <div className="text-sm text-slate-600">{item.desc}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";


export default function RelatoriosHubPage() {
  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Relatórios</h1>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          title="Assiduidade"
          desc="Presenças, ausências e % de assiduidade por turma e mês."
          href="/relatorios/assiduidade"
          cta="Abrir"
        />

        {/* Deixe reservado para futuros relatórios */}
        <Card
          title="Financeiro (em breve)"
          desc="Resumo financeiro e projeções (a consolidar com despesas)."
          disabled
        />

        {/* Inadimplência */}
        <div className="rounded border p-4">
          <h2 className="text-lg font-medium">Inadimplência</h2>
          <p className="mt-1 text-sm text-gray-600">
            Mensalidades pendentes e vencidas, por aluno/pagador.
          </p>
          <Link href="/relatorios/inadimplencia" className="mt-3 inline-block rounded border px-3 py-2">
            Abrir
          </Link>
        </div>
      </section>
    </main>
  );
}

function Card({ title, desc, href, cta = "Ver", disabled = false }) {
  if (disabled) {
    return (
      <div className="rounded border p-4 opacity-60">
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-slate-600 mt-1">{desc}</div>
      </div>
    );
  }
  return (
    <div className="rounded border p-4">
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-slate-600 mt-1 mb-3">{desc}</div>
      <Link href={href} className="inline-block border rounded px-3 py-2">
        {cta}
      </Link>
    </div>
  );
}

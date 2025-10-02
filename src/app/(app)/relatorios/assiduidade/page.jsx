"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

// 👉 Toda a lógica que usa useSearchParams vai aqui dentro
function AssiduidadeInner() {
  const search = useSearchParams();
  const turmaId = search.get("turma") ?? "";
  // ...restante da sua lógica/render dessa página
  return (
    <main className="p-6">
      {/* seu conteúdo atual */}
      <div>Relatório de Assiduidade {turmaId ? `(Turma ${turmaId})` : ""}</div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<main className="p-6">Carregando…</main>}>
      <AssiduidadeInner />
    </Suspense>
  );
}

// Evita prerender estático que falha com search params
export const dynamic = "force-dynamic";
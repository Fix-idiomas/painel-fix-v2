"use client";

import { useEffect, useState, useMemo } from "react";
import { financeGateway } from "@/lib/financeGateway";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function AppHome() {
  const [alunos, setAlunos] = useState([]);
  const [kpis, setKpis] = useState({
    total_billed: 0,
    total_paid: 0,
    total_pending: 0,
  });

  useEffect(() => {
    async function load() {
      const list = await financeGateway.listStudents();
      setAlunos(list);

      const d = new Date();
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const { kpis } = await financeGateway.listPayments({ ym });
      setKpis(kpis);
    }
    load();
  }, []);

  const ativos = useMemo(() => alunos.filter(a => a.status === "ativo"), [alunos]);

  const aniversariantesDoMes = useMemo(() => {
    const now = new Date();
    const m = now.getMonth() + 1; // 1..12
    return ativos
      .filter(a => a.birth_date && Number(a.birth_date.slice(5,7)) === m)
      .map(a => ({
        id: a.id,
        name: a.name,
        day: Number(a.birth_date.slice(8,10)),
        birth_date: a.birth_date
      }))
      .sort((a,b) => a.day - b.day);
  }, [ativos]);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Bem-vindo 👋</h1>
      <p className="text-slate-600">
        Aqui está um resumo rápido do painel. Use as abas acima para detalhes.
      </p>

      {/* Cards de resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Alunos Ativos" value={ativos.length} />
        <KpiCard title="Receita Prevista" value={fmtBRL(kpis.total_billed)} />
        <KpiCard title="Recebido" value={fmtBRL(kpis.total_paid)} />
        <KpiCard title="Pendentes" value={fmtBRL(kpis.total_pending)} />
      </div>

      {/* Aniversariantes do mês */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded border p-4 bg-white shadow-sm">
          <div className="text-xs uppercase text-gray-500 mb-2">Aniversariantes do mês</div>
          {aniversariantesDoMes.length === 0 ? (
            <div className="text-slate-600">Nenhum aniversário neste mês.</div>
          ) : (
            <ul className="space-y-1">
              {aniversariantesDoMes.map(p => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-slate-600">{String(p.day).padStart(2,'0')}/{p.birth_date.slice(5,7)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Atalhos */}
        <div className="grid gap-3">
          <a href="/alunos" className="border rounded p-4 bg-white hover:bg-slate-50 transition">
            <div className="font-semibold">📘 Alunos</div>
            <div className="text-sm text-slate-600">Cadastrar e gerenciar alunos</div>
          </a>
          <a href="/financeiro" className="border rounded p-4 bg-white hover:bg-slate-50 transition">
            <div className="font-semibold">💰 Financeiro</div>
            <div className="text-sm text-slate-600">Gerar e controlar mensalidades</div>
          </a>
        </div>
      </section>
    </section>
  );
}

function KpiCard({ title, value }) {
  return (
    <div className="rounded border p-4 bg-white shadow-sm">
      <div className="text-xs uppercase text-gray-500">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { financeGateway } from "@/lib/financeGateway";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function AppHome() {
  const [alunos, setAlunos] = useState([]);
  const [rows, setRows] = useState([]); // lançamentos do mês
  const [kpis, setKpis] = useState({ total_billed: 0, total_paid: 0, total_pending: 0 });

  useEffect(() => {
    async function load() {
      const list = await financeGateway.listStudents();
      setAlunos(list);

      const d = new Date();
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      const { rows, kpis } = await financeGateway.listPayments({ ym });
      setRows(rows);
      setKpis(kpis);
    }
    load();
  }, []);

  const ativos = useMemo(() => alunos.filter((a) => a.status === "ativo"), [alunos]);

  // --- Aniversariantes do mês INTEIRO ---
  const aniversariantesDoMes = useMemo(() => {
    const now = new Date();
    const m = now.getMonth() + 1; // 1..12
    return ativos
      .filter((a) => a.birth_date && Number(a.birth_date.slice(5, 7)) === m)
      .map((a) => ({
        id: a.id,
        name: a.name,
        day: Number(a.birth_date.slice(8, 10)),
        birth_date: a.birth_date,
      }))
      .sort((a, b) => a.day - b.day);
  }, [ativos]);

  // --- Próximos vencimentos (7 dias) ---
  const proximosVencimentos = useMemo(() => {
    const hoje = new Date();
    const addDays = (date, d) => {
      const n = new Date(date);
      n.setDate(n.getDate() + d);
      return n;
    };
    const limite = addDays(hoje, 7).toISOString().slice(0, 10); // YYYY-MM-DD
    const hojeISO = hoje.toISOString().slice(0, 10);

    return rows
      .filter((r) => r.status === "pending" && r.due_date >= hojeISO && r.due_date <= limite)
      .sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0))
      .slice(0, 10); // mostra até 10
  }, [rows]);

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Bem-vindo 👋</h1>
      <p className="text-slate-600">Resumo do mês atual. Use as abas acima para detalhes.</p>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Alunos Ativos" value={ativos.length} />
        <KpiCard title="Receita Prevista" value={fmtBRL(kpis.total_billed)} />
        <KpiCard title="Recebido" value={fmtBRL(kpis.total_paid)} />
        <KpiCard title="Pendentes" value={fmtBRL(kpis.total_pending)} />
      </div>

      {/* Duas colunas: Aniversariantes do mês | Próximos vencimentos (7d) */}
      <section className="grid gap-4 md:grid-cols-2">
        {/* Aniversariantes do mês */}
        <div className="rounded border p-4 bg-white shadow-sm">
          <div className="text-xs uppercase text-gray-500 mb-2">Aniversariantes (mês)</div>
          {aniversariantesDoMes.length === 0 ? (
            <div className="text-slate-600">Nenhum aniversário neste mês.</div>
          ) : (
            <ul className="space-y-1">
              {aniversariantesDoMes.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.name}</span>
                  <span className="text-slate-600">
                    {String(p.day).padStart(2, "0")}/{p.birth_date.slice(5, 7)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Próximos vencimentos (7 dias) */}
        <div className="rounded border p-4 bg-white shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase text-gray-500">
              Próximos vencimentos (7 dias)
            </div>
            <a href="/financeiro" className="text-sm underline">ver todos</a>
          </div>

          {proximosVencimentos.length === 0 ? (
            <div className="text-slate-600">Nenhum vencimento nos próximos 7 dias.</div>
          ) : (
            <ul className="space-y-1">
              {proximosVencimentos.map((r) => (
                <li key={r.payment_id} className="flex justify-between">
                  <span className="truncate">
                    {r.student_name} <span className="text-slate-500">({r.payer_name})</span>
                  </span>
                  <span className="text-slate-600">
                    {r.due_date.slice(8, 10)}/{r.due_date.slice(5, 7)} — {fmtBRL(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Atalhos */}
      <div className="grid gap-3 sm:grid-cols-2">
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

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { financeGateway } from "@/lib/financeGateway";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBR = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "-");
const ymNow = () => new Date().toISOString().slice(0, 7);

export default function HomePage() {
  const [ym, setYm] = useState(ymNow());
  const [loading, setLoading] = useState(true);

  // toggle "ocultar valores"
  const [hideValues, setHideValues] = useState(false);

  // dados básicos
  const [students, setStudents] = useState([]);
  const [paymentsRows, setPaymentsRows] = useState([]);
  const [paymentsKpis, setPaymentsKpis] = useState({
    total_billed: 0,
    total_paid: 0,
    total_pending: 0,
    total_overdue: 0,
  });

  // gastos
  const [expenseRows, setExpenseRows] = useState([]);
  const [expenseKpis, setExpenseKpis] = useState({
    total: 0,
    paid: 0,
    pending: 0,
    overdue: 0,
  });

  // próximos vencimentos (7 dias)
  const [upcoming, setUpcoming] = useState([]);

  // aniversariantes do mês
  const [birthdays, setBirthdays] = useState([]);

  useEffect(() => {
    // carrega preferência do toggle
    try {
      const v = localStorage.getItem("__dash_hide_values__");
      setHideValues(v === "1");
    } catch {}
  }, []);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);

      // alunos
      const studs = await financeGateway.listStudents();
      setStudents(studs);

      // financeiro (mês)
      const { rows, kpis } = await financeGateway.listPayments({
        ym,
        status: "all",
      });
      setPaymentsRows(rows);
      setPaymentsKpis(kpis);

      // gastos (mês) — usa filtros padrão (all)
      if (financeGateway.listExpenseEntries) {
        const exp = await financeGateway.listExpenseEntries({
          ym,
          status: null,
          cost_center: null,
        });
        setExpenseRows(exp.rows || []);
        setExpenseKpis(exp.kpis || { total: 0, paid: 0, pending: 0, overdue: 0 });
      } else {
        setExpenseRows([]);
        setExpenseKpis({ total: 0, paid: 0, pending: 0, overdue: 0 });
      }

      // próximos vencimentos (7 dias) — a partir das rows do mês
      const today = new Date().toISOString().slice(0, 10);
      const plus7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const coming = rows
        .filter((r) => r.status === "pending" && r.due_date >= today && r.due_date <= plus7)
        .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
        .slice(0, 5);
      setUpcoming(coming);

      // aniversariantes do mês
      const mm = ym.slice(5, 7);
      const bdays = studs
        .filter((s) => s.birth_date && s.birth_date.slice(5, 7) === mm)
        .map((s) => ({
          id: s.id,
          name: s.name,
          day: s.birth_date.slice(8, 10),
          birth_date: s.birth_date,
        }))
        .sort((a, b) => a.day.localeCompare(b.day));
      setBirthdays(bdays);

      setLoading(false);
    }
    loadAll();
  }, [ym]);

  const activeCount = useMemo(() => students.filter((s) => s.status === "ativo").length, [students]);

  // helpers "ocultar"
  const maskMoney = (n) => (hideValues ? "••••" : fmtBRL(n));
  const maskInt = (n) => (hideValues ? "••" : String(n));

  const toggleHide = () => {
    const nv = !hideValues;
    setHideValues(nv);
    try {
      localStorage.setItem("__dash_hide_values__", nv ? "1" : "0");
    } catch {}
  };

  return (
    <main className="p-6 space-y-8">
      {/* Título + controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Bem-vindo 👋</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Mês:</label>
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value.slice(0, 7))}
            className="border rounded px-2 py-1"
          />
          <button
            onClick={toggleHide}
            className="border rounded px-3 py-2"
            title="Ocultar/mostrar valores e contagens"
          >
            {hideValues ? "Mostrar valores" : "Ocultar valores"}
          </button>
        </div>
      </div>

      <p className="text-slate-600">
        Resumo do mês atual. Use as abas acima para detalhes.
      </p>

      {/* Linha 1 — KPIs principais + Gastos + Atrasos */}
      <section className="grid gap-4 md:grid-cols-6">
        <KpiCard title="Alunos ativos" value={maskInt(activeCount)} />
        <KpiCard title="Receita prevista" value={maskMoney(paymentsKpis.total_billed)} />
        <KpiCard title="Recebido" value={maskMoney(paymentsKpis.total_paid)} />
        <KpiCard title="Pendentes" value={maskMoney(paymentsKpis.total_pending)} />
        <KpiCard title="Gastos do mês" value={maskMoney(expenseKpis.total)} />
        <KpiCard title="Mensalidades atrasadas" value={maskMoney(paymentsKpis.total_overdue)} />
      </section>

      {/* Linha 2 — Aniversariantes e Próximos vencimentos */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="border rounded overflow-hidden">
          <div className="p-3 border-b font-semibold">Aniversariantes (mês)</div>
          {loading ? (
            <div className="p-4">Carregando…</div>
          ) : birthdays.length === 0 ? (
            <div className="p-4 text-slate-600">Nenhum aniversariante este mês.</div>
          ) : (
            <ul className="divide-y">
              {birthdays.map((b) => (
                <li key={b.id} className="p-3 flex items-center justify-between">
                  <span>{b.name}</span>
                  <span className="text-slate-600">{b.day}/{ym.slice(5,7)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border rounded overflow-hidden">
          <div className="p-3 border-b font-semibold flex items-center justify-between">
            <span>Próximos vencimentos (7 dias)</span>
            <Link href="/financeiro" className="text-sm underline">
              ver todos
            </Link>
          </div>
          {loading ? (
            <div className="p-4">Carregando…</div>
          ) : upcoming.length === 0 ? (
            <div className="p-4 text-slate-600">Nenhum vencimento nos próximos 7 dias.</div>
          ) : (
            <ul className="divide-y">
              {upcoming.map((r) => (
                <li key={r.payment_id} className="p-3 flex items-center justify-between">
                  <div className="truncate">
                    <div className="font-medium truncate">{r.student_name}</div>
                    <div className="text-xs text-slate-600 truncate">{r.payer_name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{fmtBR(r.due_date)}</div>
                    <div className="text-xs text-slate-600">{maskMoney(r.amount)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Observação final */}
      <div className="text-xs text-slate-500">
        * Valores e contagens podem ser ocultados pelo botão “Ocultar valores”.
      </div>
    </main>
  );
}

/* ----------------------- UI helpers ----------------------- */

function KpiCard({ title, value, className = "" }) {
  return (
    <div className={`border rounded p-3 ${className}`}>
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

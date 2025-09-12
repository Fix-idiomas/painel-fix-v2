// src/components/ResumoDoMes.jsx
"use client";

import { useEffect, useState } from "react";
import { financeGateway } from "@/lib/financeGateway";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ResumoDoMes({ ym, costCenter = null }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    receita: 0,
    despesas: 0,
    professores: 0,
    saldo: 0,
    saldo_operacional: 0,
  });

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const data = await financeGateway.getMonthlyFinancialSummary({ ym, costCenter });
        if (mounted) setSummary(data || summary);
      } catch (err) {
        console.error("ResumoDoMes.load:", err);
        if (mounted) {
          setSummary({
            receita: 0,
            despesas: 0,
            professores: 0,
            saldo: 0,
            saldo_operacional: 0,
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (ym) load();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, costCenter]);

  const { receita, despesas, professores, saldo, saldo_operacional } = summary;

  return (
   <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
  <Card
    title="Saldo do mês"
    value={loading ? "…" : fmtBRL(saldo_operacional)}
    highlight={saldo_operacional >= 0 ? "text-green-600" : "text-red-600"}
  />
  <Card title="Custo professores" value={loading ? "…" : fmtBRL(professores)} />
</section>

  );
}

function Card({ title, value, highlight }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-slate-500">{title}</div>
      <div className={`text-xl font-semibold ${highlight || ""}`}>{value}</div>
    </div>
  );
}

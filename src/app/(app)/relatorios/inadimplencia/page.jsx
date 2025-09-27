// src/app/(app)/relatorios/inadimplencia/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/contexts/SessionContext";
import { financeGateway } from "@/lib/financeGateway";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtDateBR = (s) => {
  if (!s) return "—";
  const iso = String(s);
  const safe = iso.length > 10 ? iso.slice(0, 25) : `${iso}T00:00:00`;
  const d = new Date(safe);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

function downloadCSV(filename, rows) {
  const header = Object.keys(rows[0] || {});
  const lines = [
    header.join(";"),
    ...rows.map((r) => header.map((k) => String(r[k] ?? "")).join(";")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + lines], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function RelatorioInadimplenciaPage() {
  const { session } = useSession() || {};
  const tenant_id = session?.tenantId || "11111111-1111-4111-8111-111111111111";

  const [ym, setYm] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rows, setRows] = useState([]);

  async function load() {
    try {
      setLoading(true);
      setError(null);

      // buscamos pendentes do mês e filtramos os que estão vencidos
      const { rows: all } = await financeGateway.listPayments({
        ym,
        status: "pending",
        tenant_id,
      });

      const overdue = (all || []).filter((r) => (r.days_overdue || 0) > 0);
      setRows(overdue);
    } catch (e) {
      setRows([]);
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, tenant_id]);

  const kpis = useMemo(() => {
    const total = rows.reduce((a, r) => a + Number(r.amount || 0), 0);
    const count = rows.length;
    const avgDays =
      count > 0
        ? Math.round(
            rows.reduce((a, r) => a + Number(r.days_overdue || 0), 0) / count
          )
        : 0;
    return { total, count, avgDays };
  }, [rows]);

  function exportCSV() {
    const csvRows = rows.map((r) => ({
      aluno: r.student_name || r.student_name_snapshot || r.student_id,
      pagador: r.payer_name || r.payer_name_snapshot || r.payer_id,
      competencia: String(r.due_date || "").slice(0, 7),
      vencimento: r.due_date,
      valor: String(r.amount || 0).replace(".", ","),
      dias_em_atraso: r.days_overdue || 0,
    }));
    downloadCSV(`inadimplencia-${ym}.csv`, csvRows);
  }

  return (
    <main className="p-6 space-y-6">
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-xl font-semibold">Relatório • Inadimplência</h1>
          <p className="text-sm text-gray-600">Mensalidades vencidas (pendentes) no mês.</p>
        </div>

        <div className="ml-auto flex items-end gap-3">
          <div>
            <label className="mb-1 block text-sm">Mês</label>
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="rounded border px-3 py-2"
            />
          </div>
          <button onClick={exportCSV} className="rounded border px-3 py-2" disabled={!rows.length}>
            Exportar CSV
          </button>
        </div>
      </header>

      {loading ? (
        <div className="rounded border p-4">Carregando…</div>
      ) : error ? (
        <div className="rounded border p-4 text-red-600">Erro: {error}</div>
      ) : rows.length === 0 ? (
        <div className="rounded border p-4">Sem inadimplência neste mês 🎉</div>
      ) : (
        <>
          {/* KPIs simples */}
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi title="Total em atraso" value={fmtBRL(kpis.total)} />
            <Kpi title="Qtd. boletos" value={kpis.count} />
            <Kpi title="Dias médios de atraso" value={`${kpis.avgDays}d`} />
          </section>

          {/* Tabela */}
          <section className="overflow-x-auto rounded border">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Aluno</Th>
                  <Th>Pagador</Th>
                  <Th>Competência</Th>
                  <Th>Vencimento</Th>
                  <Th className="text-right">Valor</Th>
                  <Th className="text-right">Atraso</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <Td>{r.student_name || r.student_name_snapshot || "—"}</Td>
                    <Td>{r.payer_name || r.payer_name_snapshot || "—"}</Td>
                    <Td>{String(r.due_date || "").slice(0, 7)}</Td>
                    <Td>{fmtDateBR(r.due_date)}</Td>
                    <Td className="text-right">{fmtBRL(r.amount)}</Td>
                    <Td className="text-right">{r.days_overdue || 0}d</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}

function Kpi({ title, value }) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-xs uppercase text-gray-500">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
function Th({ children, className = "" }) {
  return <th className={`px-3 py-2 text-left font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

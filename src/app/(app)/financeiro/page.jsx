"use client";

import { useEffect, useState } from "react";
import { financeGateway, FINANCE_ADAPTER } from "@/lib/financeGateway";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

// Mapa para exibir status em PT-BR (mantendo enum interno em EN)
const STATUS_LABELS = {
  pending: "Pendente",
  paid: "Pago",
  canceled: "Cancelado",
};

// Opções do filtro: label (PT) e value (EN)
const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "paid", label: "Pagos" },
  { value: "canceled", label: "Cancelados" },
];

export default function FinanceiroPage() {
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [status, setStatus] = useState("all"); // EN: all | pending | paid | canceled
  const [kpis, setKpis] = useState({
    total_billed: 0,
    total_paid: 0,
    total_pending: 0,
    total_overdue: 0,
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState(null);

  console.log("Finance adapter:", FINANCE_ADAPTER);

  async function load() {
    try {
      setLoading(true);
      const { rows, kpis } = await financeGateway.listPayments({
        ym,
        status: status === "all" ? null : status, // passa EN internamente
      });
      setRows(rows);
      setKpis(kpis);
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [ym, status]);

  async function onPreview() {
    try {
      const p = await financeGateway.previewGenerateMonth({ ym });
      setPreview(p);
    } catch (e) {
      alert(e.message || e);
    }
  }

  async function onGenerate() {
    try {
      const inserted = await financeGateway.generateMonth({ ym });
      setPreview([]);
      await load();
      alert(`Gerados ${inserted.length} lançamentos para ${ym}.`);
    } catch (e) {
      alert(e.message || e);
    }
  }

  async function onMarkPaid(id) {
    try {
      await financeGateway.markPaid(id);
      await load();
    } catch (e) {
      alert(e.message || e);
    }
  }

  async function onCancel(id) {
    const note = prompt("Motivo do cancelamento (opcional):") || "";
    try {
      await financeGateway.cancelPayment(id, note);
      await load();
    } catch (e) {
      alert(e.message || e);
    }
  }

  async function onReopen(id) {
    try {
      await financeGateway.reopenPayment(id);
      await load();
    } catch (e) {
      alert(e.message || e);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <div className="text-xs text-slate-500">
        Adapter: <b>{FINANCE_ADAPTER}</b>
      </div>

      {/* Filtros e ações */}
      <header className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm mb-1">Mês</label>
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border rounded px-3 py-2"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex gap-2">
          <button onClick={onPreview} className="rounded px-3 py-2 border">
            Prévia do mês
          </button>
          <button onClick={onGenerate} className="rounded px-3 py-2 border">
            Gerar mês
          </button>
        </div>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Faturado" value={fmtBRL(kpis.total_billed)} />
        <KpiCard title="Pagos" value={fmtBRL(kpis.total_paid)} />
        <KpiCard title="Pendentes" value={fmtBRL(kpis.total_pending)} />
        <KpiCard title="Em atraso" value={fmtBRL(kpis.total_overdue)} />
      </section>

      {/* Prévia */}
      {preview.length > 0 && (
        <section className="border rounded p-4">
          <div className="font-semibold mb-2">
            Prévia de geração ({preview.length})
          </div>
          <ul className="list-disc ml-5">
            {preview.map((p, i) => (
              <li key={i}>
                aluno={p.student_id} | pagador={p.payer_id} |{" "}
                {new Date(p.competence_month).toLocaleDateString("pt-BR", {
                  month: "2-digit",
                  year: "numeric",
                })}{" "}
                → vence em{" "}
                {new Date(p.due_date).toLocaleDateString("pt-BR")} —{" "}
                {fmtBRL(p.amount)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tabela */}
      <section className="border rounded overflow-auto">
        {loading ? (
          <div className="p-6">Carregando…</div>
        ) : error ? (
          <div className="p-6 text-red-600">Erro: {error}</div>
        ) : rows.length === 0 ? (
          <div className="p-6">Sem lançamentos para este filtro.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Aluno</Th>
                <Th>Pagador</Th>
                <Th>Competência</Th>
                <Th>Vencimento</Th>
                <Th>Valor</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.payment_id} className="border-t">
                  <Td>{r.student_name}</Td>
                  <Td>{r.payer_name}</Td>
                  <Td>
                    {new Date(r.competence_month).toLocaleDateString("pt-BR", {
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </Td>
                  <Td>
                    {new Date(r.due_date).toLocaleDateString("pt-BR")}
                    {r.days_overdue > 0 && (
                      <span className="ml-2 text-red-600">
                        ({r.days_overdue}d)
                      </span>
                    )}
                  </Td>
                  <Td>{fmtBRL(r.amount)}</Td>
                  {/* label em PT-BR */}
                  <Td>{STATUS_LABELS[r.status] || r.status}</Td>
                  <Td className="flex gap-2 py-2">
                    {r.status === "pending" ? (
                      <>
                        <button
                          onClick={() => onMarkPaid(r.payment_id)}
                          className="px-2 py-1 border rounded"
                        >
                          Marcar pago
                        </button>
                        <button
                          onClick={() => onCancel(r.payment_id)}
                          className="px-2 py-1 border rounded"
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => onReopen(r.payment_id)}
                        className="px-2 py-1 border rounded"
                      >
                        Reabrir
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function KpiCard({ title, value }) {
  return (
    <div className="rounded border p-4">
      <div className="text-xs uppercase text-gray-500">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
function Th({ children }) {
  return <th className="text-left px-3 py-2 font-medium">{children}</th>;
}
function Td({ children }) {
  return <td className="px-3 py-2">{children}</td>;
}

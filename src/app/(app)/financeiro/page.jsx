"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Guard from "@/components/Guard";
import { useSession } from "@/contexts/SessionContext";
import { financeGateway, ADAPTER_NAME } from "@/lib/financeGateway";

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
  const router = useRouter();
  const { session } = useSession();

  // 🚫 Se professor, não pode acessar esta página → redireciona para Agenda
  useEffect(() => {
    if (session?.role === "professor") {
      router.replace("/agenda");
    }
  }, [session?.role, router]);

  // Evita flicker enquanto redireciona
  if (session?.role === "professor") return null;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <Guard roles={["admin", "financeiro"]}>
      <main className="p-6 space-y-6">
        <div className="text-xs text-slate-500">
          Adapter: <b>{ADAPTER_NAME}</b>
        </div>

        {/* Filtros e ações */}
        <header className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm">Mês</label>
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="rounded border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded border px-3 py-2"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto flex gap-2">
            <button onClick={onPreview} className="rounded border px-3 py-2">
              Prévia do mês
            </button>
            <button onClick={onGenerate} className="rounded border px-3 py-2">
              Gerar mês
            </button>
          </div>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Faturado" value={fmtBRL(kpis.total_billed)} />
          <KpiCard title="Pagos" value={fmtBRL(kpis.total_paid)} />
          <KpiCard title="Pendentes" value={fmtBRL(kpis.total_pending)} />
          <KpiCard title="Em atraso" value={fmtBRL(kpis.total_overdue)} />
        </section>

        {/* Prévia */}
        {preview.length > 0 && (
          <section className="rounded border p-4">
            <div className="mb-2 font-semibold">
              Prévia de geração ({preview.length})
            </div>
            <ul className="ml-5 list-disc">
              {preview.map((p, i) => (
                <li key={i}>
                  aluno={p.student_id} | pagador={p.payer_id} |{" "}
                  {new Date(p.competence_month).toLocaleDateString("pt-BR", {
                    month: "2-digit",
                    year: "numeric",
                  })}{" "}
                  → vence em {new Date(p.due_date).toLocaleDateString("pt-BR")} —{" "}
                  {fmtBRL(p.amount)}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Tabela */}
        <section className="rounded border overflow-auto">
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
                {rows.map((r, idx) => (
                  <tr key={r.payment_id || idx} className="border-t">
                    <Td>{r.student_name}</Td>
                    <Td>{r.payer_name}</Td>
                    <Td>
                      {new Date(r.competence_month).toLocaleDateString(
                        "pt-BR",
                        {
                          month: "2-digit",
                          year: "numeric",
                        }
                      )}
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
                            className="rounded border px-2 py-1"
                          >
                            Marcar pago
                          </button>
                          <button
                            onClick={() => onCancel(r.payment_id)}
                            className="rounded border px-2 py-1"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => onReopen(r.payment_id)}
                          className="rounded border px-2 py-1"
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
    </Guard>
  );
}

/* ----------------- UI helpers ----------------- */
function KpiCard({ title, value }) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-xs uppercase text-gray-500">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
function Th({ children }) {
  return <th className="px-3 py-2 text-left font-medium">{children}</th>;
}
function Td({ children }) {
  return <td className="px-3 py-2">{children}</td>;
}

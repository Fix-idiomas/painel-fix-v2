// src/app/(app)/financeiro/page.jsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Guard from "@/components/Guard";
import { financeGateway, ADAPTER_NAME } from "@/lib/financeGateway";

/* =========================
   Utils
========================= */
const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const fmtDateBR = (s) => {
  if (!s) return "—";
  const iso = String(s);
  const safe = iso.length > 10 ? iso.slice(0, 25) : `${iso}T00:00:00`;
  const d = new Date(safe);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

// labels PT-BR do status
const STATUS_LABELS = {
  pending: "Pendente",
  paid: "Pago",
  canceled: "Cancelado",
};

// opções de status do filtro
const STATUS_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "paid", label: "Pagos" },
  { value: "canceled", label: "Cancelados" },
];

/* =========================
   Export p/ Dashboard
========================= */
// Retorna os mesmos cards que a página usa (para o Dashboard)
export async function getFinanceCards(ym) {
  // pega o resumo de mensalidades do mês (RLS já filtra por tenant)
  const summary = await financeGateway.getMonthlySummary({ ym });
  // fallback simples se adapter ainda não tiver todos os campos
  const receita = Number(summary?.receita || 0);
  const despesas = Number(summary?.despesas || 0);
  const profs = Number(summary?.professores || 0);
  // se o adapter não trouxer, usa pagos como "saldo de caixa" mínimo
  const saldoCaixa = Number(
    "saldo" in (summary || {}) ? summary.saldo : summary?.kpis?.total_paid || 0
  );
  const saldoOperacional = Number(summary?.saldo_operacional || receita - (despesas + profs));

  return [
    { key: "receita", title: "Receita (vencimento)", value: receita },
    { key: "despesas", title: "Despesas (todas)", value: despesas },
    { key: "professores", title: "Professores", value: profs },
    { key: "saldo_caixa", title: "Saldo de caixa", value: saldoCaixa },
    { key: "saldo_operacional", title: "Saldo operacional", value: saldoOperacional },
  ];
}

/* =========================
   Página
========================= */
export default function FinanceiroPage() {
  const router = useRouter();

  // mês inicial (YYYY-MM)
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [status, setStatus] = useState("all"); // all | pending | paid | canceled
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // KPIs da aba (iguais aos exportados para o Dashboard)
  const [cards, setCards] = useState([
    { key: "receita", title: "Receita (vencimento)", value: 0 },
    { key: "despesas", title: "Despesas (todas)", value: 0 },
    { key: "professores", title: "Professores", value: 0 },
    { key: "saldo_caixa", title: "Saldo de caixa", value: 0 },
    { key: "saldo_operacional", title: "Saldo operacional", value: 0 },
  ]);

  // tabela
  const [rows, setRows] = useState([]);

  // recursos do adapter
  const canPreview = typeof financeGateway.previewGenerateMonth === "function";
  const canGenerate = typeof financeGateway.generateMonth === "function";

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const paymentsPromise = financeGateway.listPayments({
        ym,
        status: status === "all" ? null : status,
      });

      const cardsPromise = getFinanceCards(ym);

      const [payments, cardsData] = await Promise.all([paymentsPromise, cardsPromise]);

      // tabela
      setRows(payments?.rows ?? payments ?? []);

      // cards → garantimos números
      const normalized = (cardsData || []).map((c) => ({
        ...c,
        value: Number(c.value || 0),
      }));
      setCards(normalized);
    } catch (e) {
      setError(e?.message || String(e));
      setRows([]);
      // mantém cards anteriores para não “piscar”
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, status]);

  // PRÉVIA
  async function openPreview() {
    if (!canPreview) return alert("Prévia indisponível no adaptador atual.");
    try {
      const prev = await financeGateway.previewGenerateMonth({ ym });
      const count = Array.isArray(prev) ? prev.length : 0;
      alert(`Prévia gerada: ${count} mensalidade(s) para ${ym}.`);
    } catch (e) {
      alert(e?.message || String(e));
    }
  }

  // GERAR
  async function doGenerate() {
    if (!canGenerate) return alert("Geração indisponível no adaptador atual.");
    if (!confirm(`Gerar mensalidades de ${ym} para alunos ativos?`)) return;
    try {
      await financeGateway.generateMonth({ ym });
      await load();
      alert("Mensalidades geradas com sucesso.");
    } catch (e) {
      alert(e?.message || String(e));
    }
  }

  // AÇÕES por linha
  async function onMarkPaid(id) {
    try {
      await financeGateway.markPaid(id);
      await load();
    } catch (e) {
      alert(e?.message || String(e));
    }
  }
  async function onCancel(id) {
    const note = prompt("Motivo do cancelamento (opcional):") || "";
    try {
      await financeGateway.cancelPayment(id, note);
      await load();
    } catch (e) {
      alert(e?.message || String(e));
    }
  }
  async function onReopen(id) {
    try {
      await financeGateway.reopenPayment(id);
      await load();
    } catch (e) {
      alert(e?.message || String(e));
    }
  }

  return (
    // Se você preferir tirar o Guard (sem roles na UI), é só remover esse wrapper.
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
            {canPreview && (
              <button onClick={openPreview} className="rounded border px-3 py-2">
                Prévia das mensalidades
              </button>
            )}
            {canGenerate && (
              <button onClick={doGenerate} className="rounded border px-3 py-2">
                Gerar mensalidades
              </button>
            )}
          </div>
        </header>

        {/* Cards de Mensalidades */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map((c) => (
            <KpiCard key={c.key} title={c.title} value={fmtBRL(c.value)} />
          ))}
        </section>

        {/* Tabela */}
        <section className="rounded border overflow-auto">
          {loading ? (
            <div className="p-6">Carregando…</div>
          ) : error ? (
            <div className="p-6 text-red-600">Erro: {error}</div>
          ) : !rows?.length ? (
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
                {rows.map((r, idx) => {
                  const id = r.payment_id || r.id || idx;
                  return (
                    <tr key={id} className="border-t">
                      <Td>{r.student_name}</Td>
                      <Td>{r.payer_name}</Td>
                      <Td>
                        {new Date(r.competence_month).toLocaleDateString("pt-BR", {
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </Td>
                      <Td>
                        {fmtDateBR(r.due_date)}
                        {Number(r.days_overdue) > 0 && (
                          <span className="ml-2 text-red-600">({r.days_overdue}d)</span>
                        )}
                      </Td>
                      <Td>{fmtBRL(r.amount)}</Td>
                      <Td>{STATUS_LABELS[r.status] || r.status}</Td>
                      <Td className="flex flex-wrap gap-2 py-2">
                        {r.status === "pending" ? (
                          <>
                            <button
                              onClick={() => onMarkPaid(id)}
                              className="rounded border px-2 py-1"
                            >
                              Marcar pago
                            </button>
                            <button
                              onClick={() => onCancel(id)}
                              className="rounded border px-2 py-1"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => onReopen(id)}
                            className="rounded border px-2 py-1"
                          >
                            Reabrir
                          </button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
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

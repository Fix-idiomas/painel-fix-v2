// src/app/(app)/financeiro/page.jsx
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

const fmtDateBR = (s) => {
  if (!s) return "—";
  // aceita "YYYY-MM-DD" OU ISO completo
  const iso = String(s);
  const safe = iso.length > 10 ? iso.slice(0, 25) : `${iso}T00:00:00`;
  const d = new Date(safe);
  const ok = !isNaN(d.getTime());
  return ok ? d.toLocaleDateString("pt-BR") : "—";
};

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
  const { session, ready = true } = useSession() || {};
  const tenant_id = session?.tenantId || "11111111-1111-4111-8111-111111111111";

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

  // ---------- estados da prévia/geração ----------
  const [preview, setPreview] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);

  // ---------- summary + filtros extras ----------
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [selectedCostCenter, setSelectedCostCenter] = useState("all");

  // ---------- capabilities do adapter ----------
  const canPreview = typeof financeGateway.previewGenerateMonth === "function";
  const canGenerate = typeof financeGateway.generateMonth === "function";

  async function load() {
    try {
      setLoading(true);

      const paymentsPromise = financeGateway.listPayments({
        ym,
        status: status === "all" ? null : status,
        tenant_id, // passa EN internamente
      });

      const summaryPromise = financeGateway.getMonthlySummary({ ym, tenant_id });

      const [{ rows, kpis }, summaryData] = await Promise.all([
        paymentsPromise,
        summaryPromise,
      ]);

      setRows(rows ?? []);
      setKpis(
        kpis ?? {
          total_billed: 0,
          total_paid: 0,
          total_pending: 0,
          total_overdue: 0,
        }
      );
      setSummary(summaryData || null);
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ym, status]);

  async function loadSummaryFor(ymArg) {
    try {
      setLoadingSummary(true);
      const res = await financeGateway.getMonthlySummary({ ym: ymArg, tenant_id });
      setSummary(res || null);
    } catch (e) {
      console.error("[getMonthlySummary]", e?.message || e);
      setSummary(null);
    } finally {
      setLoadingSummary(false);
    }
  }

  // ---------- PRÉVIA ----------
  async function openPreview() {
    if (!canPreview) {
      alert("Prévia indisponível no adaptador atual.");
      return;
    }
    if (!ready) {
      alert("Sessão ainda não pronta. Tente novamente em instantes.");
      return;
    }

    setPreviewLoading(true);
    try {
      const prev = await financeGateway.previewGenerateMonth({ ym, tenant_id });
      setPreview(prev ?? []);
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setPreviewLoading(false);
    }
  }

  // ---------- GERAR ----------
  async function doGenerate() {
    if (!canGenerate) {
      alert("Geração indisponível no adaptador atual.");
      return;
    }
    if (!ready) {
      alert("Sessão ainda não pronta. Tente novamente em instantes.");
      return;
    }
    if (!confirm("Gerar cobranças do mês para alunos ativos?")) return;

    setGenLoading(true);
    try {
      await financeGateway.generateMonth({ ym, tenant_id });
      setPreview([]); // limpa seção de prévia
      await load();
      alert("Mensalidades geradas com sucesso.");
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setGenLoading(false);
    }
  }

  // ---------- ações por item ----------
  async function onMarkPaid(id) {
    try {
      await financeGateway.markPaid(id);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function onCancel(id) {
    const note = prompt("Motivo do cancelamento (opcional):") || "";
    try {
      await financeGateway.cancelPayment(id, note);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function onReopen(id) {
    try {
      await financeGateway.reopenPayment(id);
      await load();
    } catch (e) {
      alert(e.message || String(e));
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
            {canPreview && (
              <button
                onClick={openPreview}
                className="rounded border px-3 py-2"
                disabled={previewLoading}
              >
                {previewLoading ? "Carregando prévia…" : "Prévia do mês"}
              </button>
            )}
            {canGenerate && (
              <button
                onClick={doGenerate}
                className="rounded border px-3 py-2"
                disabled={genLoading}
              >
                {genLoading ? "Gerando…" : "Gerar mês"}
              </button>
            )}
          </div>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard title="Faturado" value={fmtBRL(kpis.total_billed)} />
          <KpiCard title="Pagos" value={fmtBRL(kpis.total_paid)} />
          <KpiCard title="Pendentes" value={fmtBRL(kpis.total_pending)} />
          <KpiCard title="Em atraso" value={fmtBRL(kpis.total_overdue)} />
        </section>

        {/* Sumário (receita, despesas, etc.) */}
        {summary && (
          <section className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Receita (faturado)</div>
              <div className="text-lg font-semibold">{fmtBRL(summary.receita)}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Despesas (todas)</div>
              <div className="text-lg font-semibold">{fmtBRL(summary.despesas)}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Professores</div>
              <div className="text-lg font-semibold">{fmtBRL(summary.professores)}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Saldo</div>
              <div className="text-lg font-semibold">{fmtBRL(summary.saldo)}</div>
            </div>
            <div className="rounded border p-3">
              <div className="text-xs text-gray-500">Saldo operacional</div>
              <div className="text-lg font-semibold">
                {fmtBRL(summary.saldo_operacional)}
              </div>
            </div>
          </section>
        )}

        {/* Filtro por centro de custo */}
        {summary?.by_cost_center?.length > 0 && (
          <div className="mt-6 mb-2 flex flex-wrap items-center gap-2">
            <label className="text-sm text-gray-600">Centro de custo:</label>

            {(() => {
              const allCenters = [
                ...new Set(
                  (summary.by_cost_center || []).map((cc) => cc.cost_center || "N/A")
                ),
              ];
              return (
                <select
                  value={selectedCostCenter}
                  onChange={(e) => setSelectedCostCenter(e.target.value)}
                  className="rounded border px-2 py-1 text-sm"
                >
                  <option value="all">Todos</option>
                  {allCenters.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              );
            })()}

            {selectedCostCenter !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedCostCenter("all")}
                className="text-xs underline"
                title="Limpar filtro"
              >
                limpar
              </button>
            )}
          </div>
        )}

        {/* Despesas por centro de custo */}
        {summary?.by_cost_center?.length > 0 && (
          <section>
            <div className="mb-2 text-sm font-semibold">Despesas por centro de custo</div>

            {(() => {
              const rowsAll = summary.by_cost_center || [];
              const rows =
                selectedCostCenter === "all"
                  ? rowsAll
                  : rowsAll.filter(
                      (cc) => (cc.cost_center || "N/A") === selectedCostCenter
                    );

              const sum = (key) => rows.reduce((a, c) => a + Number(c?.[key] || 0), 0);

              return rows.length === 0 ? (
                <div className="rounded border p-3 text-sm text-gray-600">
                  Nenhum lançamento para o filtro selecionado.
                </div>
              ) : (
                <div className="overflow-x-auto rounded border">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Centro de custo</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-right">Pago</th>
                        <th className="px-3 py-2 text-right">Pendente</th>
                        <th className="px-3 py-2 text-right">Em atraso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...rows]
                        .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
                        .map((cc) => {
                          const total = Number(cc.total || 0);
                          const paid = Number(cc.paid || 0);
                          const pending = Number(cc.pending || 0);
                          const overdue = Number(cc.overdue || 0);
                          return (
                            <tr key={cc.cost_center} className="border-t">
                              <td className="px-3 py-2">{cc.cost_center || "N/A"}</td>
                              <td className="px-3 py-2 text-right">{fmtBRL(total)}</td>
                              <td className="px-3 py-2 text-right">{fmtBRL(paid)}</td>
                              <td className="px-3 py-2 text-right">{fmtBRL(pending)}</td>
                              <td className="px-3 py-2 text-right">{fmtBRL(overdue)}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-gray-50 font-medium">
                        <td className="px-3 py-2 text-right">
                          Totais{selectedCostCenter !== "all" ? " (filtro)" : ""}
                        </td>
                        <td className="px-3 py-2 text-right">{fmtBRL(sum("total"))}</td>
                        <td className="px-3 py-2 text-right">{fmtBRL(sum("paid"))}</td>
                        <td className="px-3 py-2 text-right">{fmtBRL(sum("pending"))}</td>
                        <td className="px-3 py-2 text-right">{fmtBRL(sum("overdue"))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
          </section>
        )}

        {/* Prévia inline */}
        {previewLoading && (
          <section className="rounded border p-4">
            <div>Carregando prévia…</div>
          </section>
        )}
        {!previewLoading && preview.length > 0 && (
          <section className="rounded border p-4">
            <div className="mb-2 font-semibold">
              Prévia de geração ({preview.length})
            </div>
            <ul className="ml-5 list-disc">
              {preview.map((p, i) => (
                <li key={`${p.student_id}-${p.due_date}-${i}`}>
                  <strong>{p._student_name_snapshot || p.student_id}</strong>{" "}
                  | {p.competence_month?.slice(0, 7) /* YYYY-MM */} → vence em{" "}
                  {fmtDateBR(p.due_date)} — {fmtBRL(p.amount)}{" "}
                  {p._needs_payer && <em className="text-red-600">(sem pagador)</em>}
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
                {rows.map((r, idx) => {
                  const id = r.payment_id || r.id || idx; // compat mock/supabase
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
                        {new Date(r.due_date).toLocaleDateString("pt-BR")}
                        {r.days_overdue > 0 && (
                          <span className="ml-2 text-red-600">({r.days_overdue}d)</span>
                        )}
                      </Td>
                      <Td>{fmtBRL(r.amount)}</Td>
                      {/* label em PT-BR */}
                      <Td>{STATUS_LABELS[r.status] || r.status}</Td>
                      <Td className="flex gap-2 py-2">
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

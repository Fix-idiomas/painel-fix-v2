// src/app/(app)/financeiro/mensalidades/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { financeGateway, ADAPTER_NAME } from "@/lib/financeGateway";
import Guard from "@/components/Guard";
import { useSession } from "@/contexts/SessionContext";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function MensalidadesPage() {
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7)); // "YYYY-MM"
  const [status, setStatus] = useState("all"); // all | pending | paid | canceled
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [kpis, setKpis] = useState({
    total_billed: 0,
    total_paid: 0,
    total_pending: 0,
    total_overdue: 0,
  });

  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);

  const { session, ready = true } = useSession?.() ?? {};
  // fallback apenas para ambiente de seed/dev
  const tenant_id = session?.tenantId || "11111111-1111-1111-1111-111111111111";

  const canPreview = typeof financeGateway.previewGenerateMonth === "function";
  const canGenerate = typeof financeGateway.generateMonth === "function";

  const title = useMemo(() => {
    const [Y, M] = ym.split("-");
    return `Mensalidades – ${M}/${Y}`;
  }, [ym]);

  async function load() {
    setLoading(true);
    try {
      const { rows, kpis } = await financeGateway.listPayments({ ym, status, tenant_id });
      setRows(rows ?? []);
      setKpis(
        kpis ?? {
          total_billed: 0,
          total_paid: 0,
          total_pending: 0,
          total_overdue: 0,
        }
      );
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ym, status]);

  async function openPreview() {
    if (!canPreview) {
      alert("Prévia indisponível no adaptador atual.");
      return;
    }
    setPreviewOpen(true);
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

  async function doGenerate() {
    if (!canGenerate) {
      alert("Geração indisponível no adaptador atual.");
      return;
    }
    if (!confirm("Gerar cobranças do mês para alunos ativos?")) return;
    setGenLoading(true);
    try {
      await financeGateway.generateMonth({ ym, tenant_id });
      setPreviewOpen(false);
      await load();
      alert("Mensalidades geradas com sucesso.");
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setGenLoading(false);
    }
  }

  async function markPaid(id) {
    try {
      await financeGateway.markPaid(id);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }
  async function reopen(id) {
    try {
      await financeGateway.reopenPayment(id);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }
  async function cancel(id) {
    const note = prompt("Motivo do cancelamento (opcional):") || null;
    try {
      await financeGateway.cancelPayment(id, note);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  return (
    <Guard roles={["admin", "financeiro"]}>
      <main className="p-6 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{title}</h1>
            <label className="text-sm text-slate-600">Mês:</label>
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value.slice(0, 7))}
              className="border rounded px-2 py-1"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border rounded px-2 py-1"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendentes</option>
              <option value="paid">Pagos</option>
              <option value="canceled">Cancelados</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {canPreview && (
              <button onClick={openPreview} className="border rounded px-3 py-2">
                Prévia de geração
              </button>
            )}
            {canGenerate && (
              <button
                onClick={doGenerate}
                className="border rounded px-3 py-2 bg-emerald-600 text-white"
                disabled={genLoading}
              >
                {genLoading ? "Gerando…" : "Gerar mensalidades"}
              </button>
            )}
          </div>
        </header>

        {/* Fonte/adapter (útil p/ debug) */}
        <div className="text-xs text-slate-500">
          Adapter: <b>{ADAPTER_NAME}</b>
        </div>

        {/* KPIs */}
        {!loading && (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi title="Total faturado" value={fmtBRL(kpis.total_billed)} />
            <Kpi title="Recebido" value={fmtBRL(kpis.total_paid)} />
            <Kpi title="Pendente" value={fmtBRL(kpis.total_pending)} />
            <Kpi title="Em atraso" value={fmtBRL(kpis.total_overdue)} />
          </section>
        )}

        {/* Tabela */}
        {loading ? (
          <div className="p-4">Carregando…</div>
        ) : (
          <div className="overflow-auto border rounded">
            <table className="min-w-[900px] w-full">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Aluno</Th>
                  <Th>Pagador</Th>
                  <Th>Vencimento</Th>
                  <Th>Valor</Th>
                  <Th>Status</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-500">
                      Nenhum lançamento.
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const id = r.payment_id || r.id; // compat: mock x supabase
                  return (
                    <tr key={id} className="border-t">
                      <Td>{r.student_name_snapshot || r.student_name || "—"}</Td>
                      <Td>{r.payer_name_snapshot || r.payer_name || "—"}</Td>
                      <Td>{r.due_date}</Td>
                      <Td>{fmtBRL(r.amount)}</Td>
                      <Td>
                        {r.status}
                        {r.status === "pending" && r.days_overdue > 0 ? (
                          <span className="ml-2 text-red-600 text-xs">({r.days_overdue}d)</span>
                        ) : null}
                      </Td>
                      <Td>
                        {r.status === "pending" ? (
                          <>
                            <Btn onClick={() => markPaid(id)}>Marcar pago</Btn>
                            <Btn onClick={() => cancel(id)} variant="danger">
                              Cancelar
                            </Btn>
                          </>
                        ) : (
                          <Btn onClick={() => reopen(id)} variant="secondary">
                            Reabrir
                          </Btn>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Modal simples de prévia */}
        {previewOpen && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
            <div className="bg-white rounded shadow-xl w-full max-w-2xl">
              <div className="p-4 border-b flex items-center justify-between">
                <div className="font-semibold">Prévia de geração ({ym})</div>
                <button onClick={() => setPreviewOpen(false)} className="text-slate-500">
                  ✕
                </button>
              </div>
              <div className="p-4 max-h-[60vh] overflow-auto">
                {previewLoading ? (
                  <div>Carregando…</div>
                ) : preview.length === 0 ? (
                  <div className="text-slate-500">Nada a gerar.</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <Th>Aluno</Th>
                        <Th>Vencimento</Th>
                        <Th>Valor</Th>
                        <Th>Pagador?</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((p, i) => (
                        <tr key={`${p.student_id}:${i}`} className="border-t">
                          <Td>{p.student_name || p.student_id}</Td>
                          <Td>{p.due_date}</Td>
                          <Td>{fmtBRL(p.amount)}</Td>
                          <Td>{p._needs_payer ? "Será criado" : "OK"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="p-4 border-t flex justify-end gap-2">
                <button onClick={() => setPreviewOpen(false)} className="px-3 py-2 border rounded">
                  Fechar
                </button>
                {canGenerate && (
                  <button
                    onClick={doGenerate}
                    disabled={previewLoading || genLoading || preview.length === 0}
                    className="px-3 py-2 border rounded bg-emerald-600 text-white disabled:opacity-50"
                  >
                    {genLoading ? "Gerando…" : "Gerar"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </Guard>
  );
}

function Th({ children }) {
  return (
    <th className="text-left text-xs font-semibold uppercase tracking-wide px-3 py-2 text-slate-600">
      {children}
    </th>
  );
}
function Td({ children }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}
function Kpi({ title, value }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
function Btn({ children, onClick, variant = "primary" }) {
  const base = "inline-flex items-center gap-2 px-2 py-1 rounded border text-sm mr-2";
  const styles =
    variant === "danger"
      ? "border-rose-600 text-rose-700"
      : variant === "secondary"
      ? "border-slate-400 text-slate-700"
      : "border-emerald-600 text-emerald-700";
  return (
    <button className={`${base} ${styles}`} onClick={onClick}>
      {children}
    </button>
  );
}

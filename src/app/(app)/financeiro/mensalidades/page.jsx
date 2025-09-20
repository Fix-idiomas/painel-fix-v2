// src/app/(app)/financeiro/mensalidades/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { financeGateway, ADAPTER_NAME } from "@/lib/financeGateway";
import Guard from "@/components/Guard";
import { useSession } from "@/contexts/SessionContext";
import { computeRevenueKPIs, getPaymentStatusLabel } from "@/lib/finance";

function KpiCard({ title, value, tone = "neutral" }) {
  const toneBox = {
    danger:  "border-red-300 bg-red-50",
    warning: "border-amber-300 bg-amber-50",
    success: "border-green-300 bg-green-50",
    neutral: "border-slate-200 bg-white",
  }[tone] || "border-slate-200 bg-white";

  const toneText = {
    danger:  "text-red-800",
    warning: "text-amber-800",
    success: "text-green-800",
    neutral: "text-slate-900",
  }[tone] || "text-slate-900";

  return (
    <div className={`rounded border p-3 ${toneBox}`}>
      <div className={`text-xs ${toneText} opacity-80`}>{title}</div>
      <div className={`text-xl font-semibold ${toneText}`}>{value}</div>
    </div>
  );
}

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
  const [error, setError] = useState(null);

  const [revKpis, setRevKpis] = useState({
  receita_prevista_mes: 0,
  receita_a_receber: 0,
  receita_atrasada: 0,
  receita_recebida: 0,
});

  const { session, ready = true } = useSession?.() ?? {};
  const tenant_id = session?.tenantId ?? null; // só para existir no escopo

  const canPreview = typeof financeGateway.previewGenerateMonth === "function";
  const canGenerate = typeof financeGateway.generateMonth === "function";

  const title = useMemo(() => {
    const [Y, M] = ym.split("-");
    return `Mensalidades – ${M}/${Y}`;
  }, [ym]);

async function load() {
  setLoading(true);
  setError?.(null);

  try {
    // 1) Busca pagamentos (API ignora undefined)
    const resp = await financeGateway.listPayments({
      ym,
      status: status === "all" ? undefined : status,
    });

    // 2) Extrai/normaliza linhas
    const loadedRows =
      Array.isArray(resp?.rows) ? resp.rows :
      Array.isArray(resp)       ? resp       : [];

    const rowsNorm = loadedRows.map(r => ({
      ...r,
      amount: Number(r?.amount ?? 0),
    }));
    setRows(rowsNorm);

    // 3) KPIs canônicos (policy fixa = due_date)
    const kpisNew = computeRevenueKPIs(rowsNorm, { ym, policy: "due_date" });
    setRevKpis(kpisNew);

    // (opcional) se ainda usa os KPIs legados do gateway em algum lugar:
    setKpis?.(
      resp?.kpis ?? {
        total_billed: 0,
        total_paid: 0,
        total_pending: 0,
        total_overdue: 0,
      }
    );
  } catch (e) {
    setError?.(e?.message || String(e));
    setRows([]);
    setRevKpis({
      receita_prevista_mes: 0,
      receita_a_receber: 0,
      receita_atrasada: 0,
      receita_recebida: 0,
    });
    setKpis?.({ total_billed: 0, total_paid: 0, total_pending: 0, total_overdue: 0 });
  } finally {
    setLoading(false);
  }
}

// se você usa useSession, mantenha o gate; se não usa, pode simplificar
useEffect(() => {
  // só impede quando explicitamente false; se undefined/true, carrega
  if (ready === false) return;
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
      const prev = await financeGateway.previewGenerateMonth({ ym });
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
      await financeGateway.generateMonth({ ym });
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
  function BulkPayByPayer({ rows, ym, onDone }) {
  const [open, setOpen] = useState(false);
  const [payerId, setPayerId] = useState("");
  const [busy, setBusy] = useState(false);

  // Opções de pagadores a partir das rows PENDENTES do mês corrente
  const payerOptions = useMemo(() => {
    const byId = new Map();
    for (const r of rows || []) {
      if (r?.status !== "pending") continue;
      const id = r?.payer_id;
      if (!id) continue;
      if (!byId.has(id)) {
        const name = r?.payer_name_snapshot || `Pagador ${id}`;
        byId.set(id, name);
      }
    }
    return Array.from(byId, ([value, label]) => ({ value, label }));
  }, [rows]);

  function monthRange(ymStr) {
    const start = `${ymStr}-01`;
    const d = new Date(`${ymStr}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const end = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return { start, end };
  }

  async function confirmBulkPay() {
    if (!payerId) { alert("Selecione um pagador."); return; }
    setBusy(true);
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const { start, end } = monthRange(ym);

      // Política fixa = due_date (quando quiser, trocamos para competence_month)
      const q = supabase
        .from("payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("payer_id", payerId)
        .eq("status", "pending")
        .gte("due_date", start)
        .lt("due_date", end)
        .select("id", { count: "exact" });

      const { data, error, count } = await q;
      if (error) throw error;

      setOpen(false);
      setPayerId("");
      await onDone?.();
      alert(`Pagamentos marcados como pagos: ${count ?? (Array.isArray(data) ? data.length : 0)}`);
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      {/* Botão para abrir o painel */}
      <div className="flex justify-end">
        <button
          onClick={() => setOpen((v) => !v)}
          className="border rounded px-3 py-2"
          title="Quita várias mensalidades de um mesmo pagador"
          aria-label="Pagar mais de um aluno"
        >
          Pagar + de um aluno
        </button>
      </div>

      {/* Painel inline (sem Modal) */}
      {open && (
        <div className="mt-3 rounded border p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
            <div>
              <label className="block text-sm mb-1">Selecione o pagador</label>
              <select
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="border rounded px-3 py-2 w-full"
              >
                <option value="">Selecione…</option>
                {payerOptions.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {payerOptions.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  Nenhum pagador com pendências em {ym}.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="border rounded px-3 py-2"
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                onClick={confirmBulkPay}
                className="border rounded px-3 py-2 bg-emerald-600 text-white disabled:opacity-50"
                disabled={busy || !payerId}
              >
                {busy ? "Processando…" : "Confirmar pagamento"}
              </button>
            </div>
          </div>

          <p className="mt-2 text-xs text-slate-600">
            Todos os pagamentos <strong>pendentes</strong> dos <u>alunos deste pagador</u> em {ym} serão marcados como <strong>pagos</strong>.
          </p>
        </div>
      )}
    </div>
  );
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
<BulkPayByPayer rows={rows} ym={ym} onDone={load} />

        {/* Fonte/adapter (útil p/ debug) */}
        <div className="text-xs text-slate-500">
          Adapter: <b>{ADAPTER_NAME}</b>
        </div>

        {/* KPIs */}
        {!loading && (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Total faturado" value={fmtBRL(revKpis.receita_prevista_mes + revKpis.receita_recebida)} />
            <KpiCard title="Recebido"       value={fmtBRL(revKpis.receita_recebida)} />
            <KpiCard title="Pendente"       value={fmtBRL(revKpis.receita_a_receber + revKpis.receita_atrasada)} />
            <KpiCard title="Em atraso"      value={fmtBRL(revKpis.receita_atrasada)} />
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

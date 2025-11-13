"use client";

import { Suspense, useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useRouter } from "next/navigation";
import { financeGateway } from "@/lib/financeGateway";
import Modal from "@/components/Modal";

// ---------- utils ----------
const ymNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const fmtBRL = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const csvCell = (v) => {
  const s = (v ?? "").toString();
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const fmtBRDate = (v) => {
  if (!v) return "—";
  const s = String(v).slice(0, 10); // garante "YYYY-MM-DD"
  const [Y, M, D] = s.split("-");
  return Y && M && D ? `${D}/${M}/${Y}` : s;
};
function exportCSV(rows, ym, status, costCenter) {
  const header = [
    "Título",
    "Categoria",
    "Centro de Custo",
    "Competência",
    "Vencimento",
    "Valor",
    "Status",
  ].join(",");
  const lines = [header];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.title),
        csvCell(r.category || ""),
        csvCell(r.cost_center || ""),
        csvCell(r.competence_month),
        csvCell(r.due_date),
        Number(r.amount || 0).toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        csvCell(r.status),
      ].join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const tag = [
    `outras_receitas_${ym}`,
    status && status !== "all" ? `_${status}` : "",
    costCenter && costCenter !== "all" ? `_${costCenter}` : "",
  ].join("");
  a.href = url;
  a.download = `${tag}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- wrapper com Suspense (evita erro do Next no build) ----------
export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Carregando…</div>}>
      <OtherRevenuesPage />
    </Suspense>
  );
}

function OtherRevenuesPage() {
  const search = useSearchParams();
  const router = useRouter();

  // filtros pela URL
  const [ym, setYm] = useState(search.get("ym") || ymNow());
  const [status, setStatus] = useState(search.get("status") || "all");
  const [costCenter, setCostCenter] = useState(search.get("cc") || "all");

  // dados
  const [rows, setRows] = useState([]);
  const [kpis, setKpis] = useState({ total: 0, paid: 0, pending: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [canFinanceWrite] = useState(true); // plugue seu checker quando tiver

  // modal de confirmação de cancelamento (parcela/série)
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelRow, setCancelRow] = useState(null);

  // modal de criação
  const [openNew, setOpenNew] = useState(false);
  const [newPayload, setNewPayload] = useState({
    title: "",
    amount: "",
    category: "",
    cost_center: "extra",
    frequency: "monthly", // monthly | yearly
    as_template: false,    // quando monthly: criar template recorrente indefinido
    parcelas: "1",
    due_day: "5",
    due_month: String(new Date().getMonth() + 1).padStart(2, "0"), // usado quando yearly
  });

  // --- modal de edição ---
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editPayload, setEditPayload] = useState({
    title: "",
    amount: "",
    due_date: "",
    category: "",
    cost_center: "extra",
  });

  // sincroniza querystring e recarrega
  useEffect(() => {
    const params = new URLSearchParams();
    if (ym) params.set("ym", ym);
    if (status && status !== "all") params.set("status", status);
    if (costCenter && costCenter !== "all") params.set("cc", costCenter);
    router.replace(`/financeiro/outras-receitas?${params.toString()}`);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, status, costCenter]);

  // Ouve evento para abrir o modal de cancelamento (série/parcela)
  useEffect(() => {
    const handler = (ev) => {
      const row = ev?.detail;
      if (row) {
        setCancelRow(row);
        setCancelOpen(true);
      }
    };
    window.addEventListener("open-cancel-modal", handler);
    const reloader = () => {
      load();
    };
    window.addEventListener("reload-other-revenues", reloader);
    return () => window.removeEventListener("open-cancel-modal", handler);
  }, []);

  // carrega categorias para popular o select (com fallback para input)
  useEffect(() => {
    (async () => {
      try {
        const list = await financeGateway.listExpenseCategories();
        setCategories(Array.isArray(list) ? list : []);
      } catch {
        setCategories([]);
      }
    })();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await financeGateway.listOtherRevenues({
        ym,
        status,
        cost_center: costCenter === "all" ? null : costCenter,
      });
      setRows(res.rows || []);
      setKpis(res.kpis || { total: 0, paid: 0, pending: 0, overdue: 0 });
    } finally {
      setLoading(false);
    }
  }

  // ações de linha
  async function onMarkPaid(id) {
    await financeGateway.markOtherRevenuePaid(id);
    await load();
  }
  async function onCancel(id) {
    const note = prompt("Motivo do cancelamento (opcional):") || null;
    await financeGateway.cancelOtherRevenue(id, note);
    await load();
  }
  async function onCancelSeries(row) {
    const total = Number(row.installments_total || 0);
    const idx = Number(row.installment_index || 0);
    const futureCount = total && idx ? total - idx + 1 : 0;
    const confirmTxt = `Cancelar esta parcela e as próximas pendentes?\n` +
      (futureCount > 0 ? `Total afetado (pendentes a partir desta): ${futureCount}. ` : ``) +
      `Pagas anteriores permanecem.`;
    if (!confirm(confirmTxt)) return;
    const note = prompt("Motivo do cancelamento da série (opcional):") || null;
    await financeGateway.cancelOtherRevenueSeriesFrom(row.id, note);
    await load();
  }
  async function onReopen(id) {
    await financeGateway.reopenOtherRevenue(id);
    await load();
  }

  // Helpers de série/parcelas
  function getParcelInfo(row) {
    const idx = Number(row?.installment_index || 0);
    const tot = Number(row?.installments_total || 0);
    if (idx > 0 && tot > 0) return { index: idx, total: tot };
    const m = String(row?.title || "").match(/\((\d+)\s*\/\s*(\d+)\)\s*$/);
    if (m) {
      const i = Number(m[1]);
      const t = Number(m[2]);
      if (i > 0 && t > 0) return { index: i, total: t };
    }
    return { index: 0, total: 0 };
  }

  async function onCancelSeries(row) {
    const p = getParcelInfo(row);
    const futureCount = p.total && p.index ? p.total - p.index + 1 : 0;
    const confirmTxt = `Cancelar esta parcela e as próximas pendentes?\n` +
      (futureCount > 0 ? `Total afetado (pendentes a partir desta): ${futureCount}. ` : ``) +
      `Pagas anteriores permanecem.`;
    if (!confirm(confirmTxt)) return;
    const note = prompt("Motivo do cancelamento da série (opcional):") || null;
    await financeGateway.cancelOtherRevenueSeriesFrom(row.id, note);
    await load();
  }
  function openCancelModal(row) {
    setCancelRow(row);
    setCancelOpen(true);
  }
  function closeCancelModal() {
    setCancelOpen(false);
    setCancelRow(null);
  }

  // criar nova receita
  async function onCreateNew(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (newPayload.frequency === "yearly") {
        // Criação anual (uma única receita no ano com o mês/dia escolhidos)
        const year = String(ym).slice(0, 4);
        const mm = String(newPayload.due_month || "01").padStart(2, "0");
        const dd = String(Math.min(Math.max(Number(newPayload.due_day || 5), 1), 28)).padStart(2, "0");
        const due_date = `${year}-${mm}-${dd}`;
        await financeGateway.createOtherRevenue({
          ym,
          title: newPayload.title,
          amount: Number(newPayload.amount || 0),
          due_date,
          category: newPayload.category || null,
          cost_center: newPayload.cost_center || "extra",
          // metadados (se colunas existirem)
          recurrence_kind: "indefinite",
          frequency: "yearly",
          start_month: `${ym}-01`,
        });
      } else if (newPayload.as_template === true) {
        // Template mensal indefinido: cria template e já gera o mês atual
        await financeGateway.createOtherRevenueTemplate({
          title: newPayload.title,
          amount: Number(newPayload.amount || 0),
          frequency: "monthly",
          recurrence_type: "indefinite",
          due_day: Number(newPayload.due_day || 5),
          start_month: `${ym}-01`,
          end_month: null,
          active: true,
          category: newPayload.category || null,
          cost_center: newPayload.cost_center || "extra",
        });
        // Gera o mês atual imediatamente para o usuário ver
        try { await financeGateway.ensureOtherRevenuesForMonth(ym); } catch {}
      } else {
        // Mensal: série de parcelas (se 1, vira 1/1)
        const totalParcelas = Math.max(1, Number(newPayload.parcelas || 1));
        await financeGateway.createOtherRevenueInstallments({
          ym,
          title: newPayload.title,
          amount: Number(newPayload.amount || 0),
          total_installments: totalParcelas,
          due_day: Number(newPayload.due_day || 5),
          category: newPayload.category || null,
          cost_center: newPayload.cost_center || "extra",
        });
      }
      setOpenNew(false);
      setNewPayload({
        title: "",
        amount: "",
        category: "",
        cost_center: "extra",
        frequency: "monthly",
        as_template: false,
        parcelas: "1",
        due_day: "5",
        due_month: String(new Date().getMonth() + 1).padStart(2, "0"),
      });
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  }, [rows]);

  // editar
  function openEditModal(row) {
    setEditRow(row);
    setEditPayload({
      title: row.title || "",
      amount: String(row.amount ?? ""),
      due_date: (row.due_date || "").slice(0, 10),
      category: row.category || "",
      cost_center: row.cost_center || "extra",
    });
    setEditOpen(true);
  }

  async function onSaveEdit(e) {
    e.preventDefault();
    if (!editRow) return;
    await financeGateway.updateOtherRevenue(editRow.id, {
      title: editPayload.title,
      amount: Number(editPayload.amount || 0),
      due_date: editPayload.due_date ? editPayload.due_date.slice(0, 10) : null,
      category: editPayload.category || null,
      cost_center: editPayload.cost_center || "extra",
    });
    setEditOpen(false);
    setEditRow(null);
    await load();
  }

  // ---------- render ----------
  return (
    <main className="p-6 space-y-6">
      {/* Toolbar de filtros e ações */}
      <div className="flex flex-wrap gap-3 items-center">
        <div>
          <label className="block text-xs mb-1 text-slate-600">Competência</label>
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={() => {
                const [Y,M] = ym.split('-').map(Number); const d=new Date(Y,M-1,1); d.setMonth(d.getMonth()-1); const newYm=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; setYm(newYm);
              }}
              className="border rounded px-2 py-1 text-xs"
              title="Mês anterior"
            >◄</button>
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="border rounded px-3 py-2"
            />
            <button
              type="button"
              onClick={() => {
                const [Y,M] = ym.split('-').map(Number); const d=new Date(Y,M-1,1); d.setMonth(d.getMonth()+1); const newYm=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; setYm(newYm);
              }}
              className="border rounded px-2 py-1 text-xs"
              title="Próximo mês"
            >►</button>
          </div>
        </div>
        <div>
          <label className="block text-xs mb-1 text-slate-600">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="all">Todos</option>
            <option value="pending">Pendentes</option>
            <option value="canceled">Cancelados</option>
            <option value="paid">Pagos</option>
            <option value="overdue">Atrasados</option>
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1 text-slate-600">Centro de custo</label>
          <select
            value={costCenter}
            onChange={(e) => setCostCenter(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="all">Todos</option>
            <option value="extra">Extra</option>
            <option value="PJ">PJ</option>
            <option value="PF">PF</option>
          </select>
        </div>
        <div className="flex-1" />
        <div className="ml-auto flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => exportCSV(sorted, ym, status, costCenter)}
            className="border rounded px-3 py-2 text-sm hover:bg-slate-50"
          >
            Exportar CSV
          </button>
          <button
            onClick={() => setOpenNew(true)}
            className="border rounded px-3 py-2 text-sm bg-slate-900 text-white hover:bg-black"
          >
            Nova receita
          </button>
          <button
            onClick={async () => {
              const confirmGen = confirm("Gerar automaticamente receitas recorrentes (templates) para este mês?");
              if (!confirmGen) return;
              try {
                await financeGateway.ensureOtherRevenuesForMonth(ym);
                await load();
                alert("Geração automática concluída.");
              } catch (e) {
                alert(e.message);
              }
            }}
            className="border rounded px-3 py-2 text-sm hover:bg-slate-50"
          >
            Gerar mês (templates)
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Total" value={fmtBRL(kpis.total)} tone="neutral" />
        <Kpi title="Pagas" value={fmtBRL(kpis.paid)} tone="success" />
        <Kpi title="Pendentes" value={fmtBRL(kpis.pending)} tone="warning" />
        <Kpi title="Atrasadas" value={fmtBRL(kpis.overdue)} tone="danger" />
      </div>

      {/* Tabela + Cards (como Gastos) */}
      {loading ? (
        <div className="p-4">Carregando…</div>
      ) : sorted.length === 0 ? (
        <div className="p-4 border rounded">Sem receitas para este filtro.</div>
      ) : (
        <div className="w-full">
          {/* Tabela (>= sm) */}
          <div className="hidden sm:block overflow-x-auto border rounded">
            <table className="min-w-[900px] w-full text-xs sm:text-sm">
              <thead className="sticky top-0 z-10 bg-white/90 border-b">
                <tr>
                  <Th>Título</Th>
                  <Th>Categoria</Th>
                  <Th>Centro</Th>
                  <Th>Competência</Th>
                  <Th>Vencimento</Th>
                  <Th>Parcela</Th>
                  <Th className="text-right">Valor</Th>
                  <Th>Status</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="border-t odd:bg-slate-50/40 hover:bg-slate-50">
                    <Td className="max-w-[260px] truncate" title={r.title}>
                      {r.title}
                      {(() => { const p = getParcelInfo(r); return p.total > 1; })() && (
                        <span
                          className="ml-2 align-middle text-[10px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600"
                          title={(function(){ const p=getParcelInfo(r); return `Série de ${p.total} parcelas — esta é a ${p.index}`; })()}
                        >
                          Série
                        </span>
                      )}
                    </Td>
                    <Td>{r.category || "—"}</Td>
                    <Td>{r.cost_center || "—"}</Td>
                    <Td>{fmtBRDate(r.competence_month)}</Td>
                    <Td>{fmtBRDate(r.due_date)}</Td>
                    <Td className="whitespace-nowrap">
                      {(() => { const p = getParcelInfo(r); return p.total > 0 ? `${p.index}/${p.total}` : "—"; })()}
                    </Td>
                    <Td className="text-right">{fmtBRL(r.amount)}</Td>
                    <Td className="whitespace-nowrap">
                      <Badge status={r.status} />
                      {r.status === "pending" && r.days_overdue > 0 && (
                        <span className="ml-2 text-red-600 text-xs">({r.days_overdue}d)</span>
                      )}
                    </Td>
                    <Td>
                      <RowActions
                        row={r}
                        onPaid={onMarkPaid}
                        onCancel={onCancel}
                        onCancelSeries={onCancelSeries}
                        onReopen={onReopen}
                        canWrite={canFinanceWrite}
                        onEdit={() => openEditModal(r)}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards (xs) */}
          <div className="sm:hidden divide-y border rounded">
            {sorted.map((r) => (
              <div key={r.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate" title={r.title}>{r.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="whitespace-nowrap">{fmtBRDate(r.due_date)}</span>
                      {r.category && <span className="truncate max-w-[140px]">{r.category}</span>}
                      {r.cost_center && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{r.cost_center}</span>
                      )}
                      {(() => { const p = getParcelInfo(r); return p.total > 0 ? (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 whitespace-nowrap">{`${p.index}/${p.total}`}</span>
                      ) : null; })()}
                      <Badge status={r.status} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono tabular-nums font-semibold">{fmtBRL(r.amount)}</div>
                  </div>
                </div>
                <div className="mt-2">
                  <RowActions
                    row={r}
                    onPaid={onMarkPaid}
                    onCancel={onCancel}
                    onCancelSeries={onCancelSeries}
                    onReopen={onReopen}
                    canWrite={canFinanceWrite}
                    onEdit={() => openEditModal(r)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Nova receita */}
      {openNew && (
        <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center px-4">
          <form onSubmit={onCreateNew} className="w-full max-w-lg rounded-lg bg-white p-5 shadow">
            <h2 className="text-lg font-semibold mb-4">Nova receita</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs mb-1">Título *</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={newPayload.title}
                  onChange={(e) => setNewPayload((p) => ({ ...p, title: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-xs mb-1">Valor *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full border rounded px-3 py-2"
                  value={newPayload.amount}
                  onChange={(e) => setNewPayload((p) => ({ ...p, amount: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-xs mb-1">Frequência *</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={newPayload.frequency}
                  onChange={(e) => setNewPayload((p) => ({ ...p, frequency: e.target.value, as_template: false }))}
                  required
                >
                  <option value="monthly">Mensal</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>

              {newPayload.frequency === "monthly" && !newPayload.as_template && (
                <div>
                  <label className="block text-xs mb-1">Nº parcelas *</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full border rounded px-3 py-2"
                    value={newPayload.parcelas}
                    onChange={(e) => setNewPayload((p) => ({ ...p, parcelas: e.target.value }))}
                    required
                  />
                </div>
              )}

              {newPayload.frequency === "monthly" && (
                <div className="md:col-span-2 flex items-center gap-2 border rounded px-3 py-2">
                  <input
                    id="as_template"
                    type="checkbox"
                    className="accent-black"
                    checked={!!newPayload.as_template}
                    onChange={(e) => setNewPayload((p) => ({ ...p, as_template: e.target.checked }))}
                  />
                  <label htmlFor="as_template" className="text-sm">
                    Gerar automaticamente todo mês (recorrente indefinido)
                  </label>
                </div>
              )}

              {newPayload.frequency === "yearly" && (
                <div>
                  <label className="block text-xs mb-1">Mês do vencimento *</label>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={newPayload.due_month}
                    onChange={(e) => setNewPayload((p) => ({ ...p, due_month: e.target.value }))}
                    required
                  >
                    {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs mb-1">Dia vencimento *</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  className="w-full border rounded px-3 py-2"
                  value={newPayload.due_day}
                  onChange={(e) => setNewPayload((p) => ({ ...p, due_day: e.target.value }))}
                  required
                />
              </div>

              <div className="md:col-span-2 text-xs text-slate-500">
                {newPayload.frequency === "yearly" ? (
                  <>Gera 1 receita anual com vencimento em {String(newPayload.due_day).padStart(2, "0")}/{newPayload.due_month}/{String(ym).slice(0,4)}.</>
                ) : newPayload.as_template ? (
                  <>Gerará automaticamente 1 receita por mês (dia {String(newPayload.due_day).padStart(2, "0")}) a partir de {ym}, até desativar.</>
                ) : (
                  <>Gera {newPayload.parcelas || 1} receita(s) mensal(is) iniciando em {ym}.</>
                )}
              </div>

              <div>
                <label className="block text-xs mb-1">Categoria</label>
                {Array.isArray(categories) && categories.length > 0 ? (
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={newPayload.category}
                    onChange={(e) => setNewPayload((p) => ({ ...p, category: e.target.value }))}
                  >
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={newPayload.category}
                    onChange={(e) => setNewPayload((p) => ({ ...p, category: e.target.value }))}
                    placeholder="ex.: evento, material…"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs mb-1">Centro de custo</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={newPayload.cost_center}
                  onChange={(e) => setNewPayload((p) => ({ ...p, cost_center: e.target.value }))}
                >
                  <option value="extra">Extra</option>
                  <option value="PJ">PJ</option>
                  <option value="PF">PF</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setOpenNew(false)}
                className="border rounded px-4 py-2"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded bg-black text-white px-4 py-2 disabled:opacity-60"
              >
                Criar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Cancelar — série/parcela */}
      {cancelOpen && (
        <Modal
          open={cancelOpen}
          onClose={closeCancelModal}
          title="Cancelar receita"
          footer={(
            <>
              <button
                className="border rounded px-3 py-1"
                onClick={closeCancelModal}
              >
                Fechar
              </button>
              {cancelRow && (
                <>
                  <button
                    className="border rounded px-3 py-1"
                    onClick={async () => {
                      await onCancel(cancelRow.id);
                      closeCancelModal();
                    }}
                  >
                    Cancelar somente esta
                  </button>
                  <button
                    className="rounded bg-black text-white px-3 py-1"
                    onClick={async () => {
                      await onCancelSeries(cancelRow);
                      closeCancelModal();
                    }}
                  >
                    Cancelar série
                  </button>
                </>
              )}
            </>
          )}
        >
          {cancelRow ? (
            <CancelSeriesBody row={cancelRow} getParcelInfo={getParcelInfo} />
          ) : null}
        </Modal>
      )}

      {/* Modal Editar receita */}
      {editOpen && (
        <div className="fixed inset-0 z-50 bg-black/20 flex items-center justify-center px-4">
          <form onSubmit={onSaveEdit} className="w-full max-w-lg rounded-lg bg-white p-5 shadow">
            <h2 className="text-lg font-semibold mb-4">Editar receita</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs mb-1">Título *</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={editPayload.title}
                  onChange={(e) => setEditPayload((p) => ({ ...p, title: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-xs mb-1">Valor *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full border rounded px-3 py-2"
                  value={editPayload.amount}
                  onChange={(e) => setEditPayload((p) => ({ ...p, amount: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-xs mb-1">Vencimento</label>
                <input
                  type="date"
                  className="w-full border rounded px-3 py-2"
                  value={editPayload.due_date}
                  onChange={(e) => setEditPayload((p) => ({ ...p, due_date: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-xs mb-1">Categoria</label>
                {Array.isArray(categories) && categories.length > 0 ? (
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={editPayload.category}
                    onChange={(e) => setEditPayload((p) => ({ ...p, category: e.target.value }))}
                  >
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={editPayload.category}
                    onChange={(e) => setEditPayload((p) => ({ ...p, category: e.target.value }))}
                    placeholder="ex.: evento, material…"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs mb-1">Centro de custo</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={editPayload.cost_center}
                  onChange={(e) => setEditPayload((p) => ({ ...p, cost_center: e.target.value }))}
                >
                  <option value="extra">Extra</option>
                  <option value="PJ">PJ</option>
                  <option value="PF">PF</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditOpen(false);
                  setEditRow(null);
                }}
                className="border rounded px-4 py-2"
              >
                Cancelar
              </button>
              <button type="submit" className="rounded bg-black text-white px-4 py-2">
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

// ---------- subcomponentes ----------
function Kpi({ title, value, tone = "neutral" }) {
  const accent = {
    danger: "bg-rose-600",
    warning: "bg-amber-500",
    success: "bg-green-600",
    neutral: "bg-slate-300",
  }[tone] || "bg-slate-300";
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-4 overflow-hidden">
      <div className={`h-1 mx-4 ${accent} rounded-full mb-3`}></div>
      <div className="text-[11px] uppercase tracking-wide text-slate-600">{title}</div>
      <div className="text-base sm:text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
function Th({ children, className = "" }) {
  return <th className={`text-left px-3 py-2 font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
function Badge({ status }) {
  const map = {
    paid: {
      label: "Pago",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    pending: {
      label: "A vencer",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    },
    canceled: {
      label: "Cancelado",
      cls: "bg-rose-50 text-rose-700 border-rose-200",
    },
    overdue: {
      label: "Atrasado",
      cls: "bg-red-50 text-red-700 border-red-200",
    },
  };

  const item = map[status] || { label: status || "—", cls: "" };

  return (
    <span
      className={`inline-block text-xs px-2 py-1 rounded border ${item.cls}`}
    >
      {item.label}
    </span>
  );
}
function RowActions({ row, onPaid, onCancel, onReopen, onEdit, canWrite = true }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    function onDocClick(e) {
      const target = e.target;
      if (btnRef.current && btnRef.current.contains(target)) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setOpen(false);
    }
    function onEsc(e) { if (e.key === 'Escape') setOpen(false); }
    function update() {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const estWidth = 180; // approximate menu width
      const padding = 8;
      const left = Math.min(Math.max(padding, rect.right - estWidth), window.innerWidth - estWidth - padding);
      const top = rect.bottom + 4;
      setPos({ top, left });
    }
    if (open) {
      update();
      document.addEventListener('mousedown', onDocClick);
      window.addEventListener('resize', update);
      window.addEventListener('scroll', update, true);
      document.addEventListener('keydown', onEsc);
      return () => {
        document.removeEventListener('mousedown', onDocClick);
        window.removeEventListener('resize', update);
        window.removeEventListener('scroll', update, true);
        document.removeEventListener('keydown', onEsc);
      };
    }
  }, [open]);

  function isSeries(r) {
    const idx = Number(r?.installment_index || 0);
    const tot = Number(r?.installments_total || 0);
    if (idx > 0 && tot > 1) return true;
    const m = String(r?.title || "").match(/\((\d+)\s*\/\s*(\d+)\)\s*$/);
    return !!(m && Number(m[2]) > 1);
  }

  if (!canWrite) return <span className="text-xs text-slate-500">—</span>;

  return (
    <div className="inline-block text-left">
      <button
        type="button"
        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
        ref={btnRef}
      >
        ⋯ Ações
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
        </svg>
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left }} className="w-40 origin-top-right rounded-md border bg-white shadow-lg z-50">
          <div className="py-1 text-sm">
            {row.status !== 'paid' && row.status !== 'canceled' && (
              <button
                onClick={() => { setOpen(false); onPaid(row.id); }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50"
              >
                Marcar pago
              </button>
            )}

            {row.status !== 'canceled' && (
              <button
                onClick={() => {
                  setOpen(false);
                  if (isSeries(row)) {
                    const ev = new CustomEvent('open-cancel-modal', { detail: row });
                    window.dispatchEvent(ev);
                  } else {
                    onCancel(row.id);
                  }
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50"
              >
                Cancelar
              </button>
            )}

            {row.status !== 'pending' && (
              <button
                onClick={() => { setOpen(false); onReopen(row.id); }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50"
              >
                Reabrir
              </button>
            )}

            <div className="my-1 border-t" />

            <button
              onClick={async () => {
                setOpen(false);
                try {
                  if (isSeries(row)) {
                    const confirmSeries = confirm('Excluir FUTURAS parcelas pendentes desta série? Pagas anteriores permanecem.');
                    if (!confirmSeries) return;
                    await financeGateway.deleteOtherRevenueSeriesFrom(row.id);
                  } else {
                    const confirmOne = confirm('Excluir definitivamente esta receita?');
                    if (!confirmOne) return;
                    await financeGateway.deleteOtherRevenue(row.id);
                  }
                  window.dispatchEvent(new Event('reload-other-revenues'));
                } catch (e) {
                  alert(e.message);
                }
              }}
              className="w-full text-left px-3 py-1.5 text-red-700 hover:bg-red-50"
            >
              Excluir
            </button>

            <button
              onClick={() => { setOpen(false); onEdit(); }}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50"
            >
              Editar
            </button>
          </div>
        </div>, document.body)
      }
    </div>
  );
}

// Corpo do modal de cancelamento (informativo)
function CancelSeriesBody({ row, getParcelInfo }) {
  const p = getParcelInfo(row);
  const future = p.total && p.index ? p.total - p.index + 1 : 0;
  return (
    <div className="space-y-2 text-sm">
      <p>
        Título: <strong>{row.title}</strong>
      </p>
      {p.total > 0 && (
        <p>
          Parcela: <strong>{p.index}/{p.total}</strong>
        </p>
      )}
      {p.total > 1 && (
        <p className="text-slate-600">
          Se optar por cancelar a série a partir desta, serão afetadas {future} parcela(s) pendentes.
        </p>
      )}
      <p className="text-slate-600">Escolha abaixo a ação desejada.</p>
    </div>
  );
}
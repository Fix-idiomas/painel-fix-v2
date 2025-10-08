"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { financeGateway } from "@/lib/financeGateway";

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

  const [submitting, setSubmitting] = useState(false);
  const [canFinanceWrite] = useState(true); // plugue seu checker quando tiver

  // modal de criação
  const [openNew, setOpenNew] = useState(false);
  const [newPayload, setNewPayload] = useState({
    title: "",
    amount: "",
    due_date: "", // YYYY-MM-DD
    category: "",
    cost_center: "extra",
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
  async function onReopen(id) {
    await financeGateway.reopenOtherRevenue(id);
    await load();
  }

  // criar nova receita (avulsa/manual)
  async function onCreateNew(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        ym, // competência vem do seletor
        title: newPayload.title,
        amount: Number(newPayload.amount || 0),
        due_date: newPayload.due_date ? newPayload.due_date.slice(0, 10) : null,
        category: newPayload.category || null,
        cost_center: newPayload.cost_center || "extra",
      };
      await financeGateway.createOtherRevenue(payload);
      setOpenNew(false);
      setNewPayload({
        title: "",
        amount: "",
        due_date: "",
        category: "",
        cost_center: "extra",
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

  return (
    <main className="p-6 space-y-6">
      {/* Header / Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-semibold">Outras Receitas</h1>

        <div>
          <label className="block text-xs mb-1 text-slate-600">Mês</label>
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            className="border rounded px-3 py-2"
          />
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
            <option value="paid">Pagos</option>
            <option value="canceled">Cancelados</option>
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

        <button
          onClick={() => exportCSV(sorted, ym, status, costCenter)}
          className="border rounded px-3 py-2"
        >
          Exportar CSV
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setOpenNew(true)}
          className="rounded bg-black text-white px-4 py-2"
        >
          Nova receita
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi title="Total" value={fmtBRL(kpis.total)} />
        <Kpi title="Pagas" value={fmtBRL(kpis.paid)} />
        <Kpi title="Pendentes" value={fmtBRL(kpis.pending)} />
        <Kpi title="Atrasadas" value={fmtBRL(kpis.overdue)} />
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="p-4">Carregando…</div>
      ) : sorted.length === 0 ? (
        <div className="p-4 border rounded">Sem receitas para este filtro.</div>
      ) : (
        <div className="border rounded overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Título</Th>
                <Th>Categoria</Th>
                <Th>Centro</Th>
                <Th>Competência</Th>
                <Th>Vencimento</Th>
                <Th className="text-right">Valor</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-t">
                  <Td className="max-w-[260px] truncate" title={r.title}>
                    {r.title}
                  </Td>
                  <Td>{r.category || "—"}</Td>
                  <Td>{r.cost_center || "—"}</Td>
                  <Td>{fmtBRDate(r.competence_month)}</Td>
                  <Td>{fmtBRDate(r.due_date)}</Td>
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
                <label className="block text-xs mb-1">Vencimento (data)</label>
                <input
                  type="date"
                  className="w-full border rounded px-3 py-2"
                  value={newPayload.due_date}
                  onChange={(e) =>
                    setNewPayload((p) => ({ ...p, due_date: e.target.value.slice(0, 10) }))
                  }
                />
              </div>

              <div>
                <label className="block text-xs mb-1">Categoria</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={newPayload.category}
                  onChange={(e) => setNewPayload((p) => ({ ...p, category: e.target.value }))}
                  placeholder="ex.: evento, material…"
                />
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
                <input
                  className="w-full border rounded px-3 py-2"
                  value={editPayload.category}
                  onChange={(e) => setEditPayload((p) => ({ ...p, category: e.target.value }))}
                  placeholder="ex.: evento, material…"
                />
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
function Kpi({ title, value }) {
  return (
    <div className="rounded border p-4">
      <div className="text-xs text-slate-600">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
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
  return (
    <div className="flex gap-2">
      {canWrite && row.status !== "paid" && row.status !== "canceled" && (
        <button
          onClick={() => onPaid(row.id)}
          className="text-xs rounded border px-2 py-1"
          title="Marcar como pago"
        >
          Pagar
        </button>
      )}

      {canWrite && row.status !== "canceled" && (
        <button
          onClick={() => onCancel(row.id)}
          className="text-xs rounded border px-2 py-1"
          title="Cancelar"
        >
          Cancelar
        </button>
      )}

      {canWrite && row.status !== "pending" && (
        <button
          onClick={() => onReopen(row.id)}
          className="text-xs rounded border px-2 py-1"
          title="Reabrir"
        >
          Reabrir
        </button>
      )}

      {canWrite && (
        <button onClick={onEdit} className="text-xs rounded border px-2 py-1" title="Editar">
          Editar
        </button>
      )}
    </div>
  );
}
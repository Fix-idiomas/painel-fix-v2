"use client";

import { useEffect, useState } from "react";
import { financeGateway } from "@/lib/financeGateway";
import Modal from "@/components/Modal";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBR = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "-");

export default function GastosPage() {
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7));
  const [status, setStatus] = useState("all");      // all | pending | paid | canceled
  const [costCenter, setCostCenter] = useState("all"); // all | PJ | PF

  // mês
  const [rows, setRows] = useState([]);
  const [kpis, setKpis] = useState({ total: 0, paid: 0, pending: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);

  // templates recorrentes
  const [templates, setTemplates] = useState([]);
  const [openEditTpl, setOpenEditTpl] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplId, setTplId] = useState(null);
  const [formTpl, setFormTpl] = useState({
    title: "",
    category: "",
    amount: "",
    frequency: "monthly", // monthly | annual
    due_day: "5",
    due_month: "1",
    active: true,
    cost_center: "PJ",     // PJ | PF
  });

  // lançamento avulso
  const [openAvulso, setOpenAvulso] = useState(false);
  const [savingAvulso, setSavingAvulso] = useState(false);
  const [formAvulso, setFormAvulso] = useState({
    date: "",
    title: "",
    category: "",
    amount: "",
    cost_center: "PJ",     // PJ | PF
  });

  // ====== Carregamentos ======
  async function load() {
    setLoading(true);
    const { rows, kpis } = await financeGateway.listExpenseEntries({
      ym,
      status: status === "all" ? null : status,
      cost_center: costCenter === "all" ? null : costCenter,
    });
    setRows(rows);
    setKpis(kpis);
    setLoading(false);
  }

  async function loadTemplates() {
    const list = await financeGateway.listExpenseTemplates();
    setTemplates(list);
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    load();
  }, [ym, status, costCenter]);

  // ====== Ações do mês ======
  async function onPreview() {
    const prev = await financeGateway.previewGenerateExpenses({ ym });
    if (prev.length === 0) {
      alert("Nada a gerar para este mês.");
      return;
    }
    const txt =
      "Prévia de geração:\n\n" +
      prev
        .map(
          (p) =>
            `• ${p.title_snapshot} — ${fmtBRL(p.amount)} (venc. ${fmtBR(p.due_date)})`
        )
        .join("\n") +
      "\n\nDeseja GERAR esses lançamentos?";
    if (confirm(txt)) {
      await financeGateway.generateExpenses({ ym });
      await load();
    }
  }

  // ====== Ações por item ======
  const markPaid = async (id) => {
    await financeGateway.markExpensePaid(id);
    await load();
  };
  const reopen = async (id) => {
    await financeGateway.reopenExpense(id);
    await load();
  };
  const cancel = async (id) => {
    const note = prompt("Motivo do cancelamento (opcional):") || "";
    await financeGateway.cancelExpense(id, note);
    await load();
  };
  const delEntry = async (id) => {
    if (!confirm("Excluir lançamento?")) return;
    await financeGateway.deleteExpenseEntry(id);
    await load();
  };

  // ====== Templates ======
  function openCreateTpl() {
    setTplId(null);
    setFormTpl({
      title: "",
      category: "",
      amount: "",
      frequency: "monthly",
      due_day: "5",
      due_month: "1",
      active: true,
      cost_center: "PJ",
    });
    setOpenEditTpl(true);
  }

  function openEditTplModal(t) {
    setTplId(t.id);
    setFormTpl({
      title: t.title || "",
      category: t.category || "",
      amount: String(t.amount ?? ""),
      frequency: t.frequency || "monthly",
      due_day: String(t.due_day ?? "5"),
      due_month: String(t.due_month ?? "1"),
      active: !!t.active,
      cost_center: t.cost_center || "PJ",
    });
    setOpenEditTpl(true);
  }

  async function onSubmitTpl(e) {
    e?.preventDefault?.();
    try {
      setSavingTpl(true);
      const payload = {
        title: formTpl.title.trim(),
        category: formTpl.category.trim() || null,
        amount: Number(formTpl.amount || 0),
        frequency: formTpl.frequency,
        due_day: Number(formTpl.due_day || 5),
        due_month: Number(formTpl.due_month || 1),
        active: !!formTpl.active,
        cost_center: formTpl.cost_center,
      };
      if (!payload.title) throw new Error("Título é obrigatório");

      if (tplId) await financeGateway.updateExpenseTemplate(tplId, payload);
      else await financeGateway.createExpenseTemplate(payload);

      setOpenEditTpl(false);
      await loadTemplates();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSavingTpl(false);
    }
  }

  async function onDeleteTpl(t) {
    if (!confirm(`Excluir recorrente "${t.title}"?`)) return;
    await financeGateway.deleteExpenseTemplate(t.id);
    await loadTemplates();
  }

  // ====== Avulso ======
  function openAvulsoModal() {
    setFormAvulso({
      date: "",
      title: "",
      category: "",
      amount: "",
      cost_center: "PJ",
    });
    setOpenAvulso(true);
  }

  async function onSubmitAvulso(e) {
    e?.preventDefault?.();
    try {
      setSavingAvulso(true);
      const payload = {
        date: formAvulso.date,
        title: formAvulso.title.trim(),
        category: formAvulso.category.trim() || null,
        amount: Number(formAvulso.amount || 0),
        cost_center: formAvulso.cost_center,
      };
      if (!payload.date) throw new Error("Data é obrigatória");
      if (!payload.title) throw new Error("Título é obrigatório");
      await financeGateway.createOneOffExpense(payload);
      setOpenAvulso(false);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSavingAvulso(false);
    }
  }

  return (
    <main className="p-6 space-y-8">
      {/* Header / Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Gastos</h1>

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

        <select
          value={costCenter}
          onChange={(e) => setCostCenter(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="all">Todos os centros</option>
          <option value="PJ">PJ (Empresa)</option>
          <option value="PF">PF (Pessoal)</option>
        </select>

        <button onClick={onPreview} className="border rounded px-3 py-2">
          Prévia / Gerar
        </button>
        <button onClick={openAvulsoModal} className="border rounded px-3 py-2">
          + Avulso
        </button>
      </div>

      {/* KPIs */}
      <section className="grid sm:grid-cols-4 gap-3">
        <KpiCard title="Total do mês" value={fmtBRL(kpis.total)} />
        <KpiCard title="Pagos" value={fmtBRL(kpis.paid)} />
        <KpiCard title="Pendentes" value={fmtBRL(kpis.pending)} />
        <KpiCard title="Em atraso" value={fmtBRL(kpis.overdue)} />
      </section>

      {/* Lançamentos do mês */}
      <section className="border rounded overflow-auto">
        <div className="p-3 border-b font-semibold">Lançamentos do mês</div>
        {loading ? (
          <div className="p-4">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="p-4">Sem lançamentos para este filtro.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Vencimento</Th>
                <Th>Título</Th>
                <Th>Categoria</Th>
                <Th>Centro</Th>
                <Th>Valor</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <Td>{fmtBR(r.due_date)}</Td>
                  <Td>{r.title_snapshot}</Td>
                  <Td>{r.category || "-"}</Td>
                  <Td>{r.cost_center || "-"}</Td>
                  <Td>{fmtBRL(r.amount)}</Td>
                  <Td>{r.status}</Td>
                  <Td className="py-2">
                    <div className="flex gap-2">
                      {r.status !== "paid" && (
                        <button
                          onClick={() => markPaid(r.id)}
                          className="px-2 py-1 border rounded"
                        >
                          Marcar pago
                        </button>
                      )}
                      {r.status === "paid" && (
                        <button
                          onClick={() => reopen(r.id)}
                          className="px-2 py-1 border rounded"
                        >
                          Reabrir
                        </button>
                      )}
                      {r.status !== "canceled" && (
                        <button
                          onClick={() => cancel(r.id)}
                          className="px-2 py-1 border rounded"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        onClick={() => delEntry(r.id)}
                        className="px-2 py-1 border rounded"
                      >
                        Excluir
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recorrentes */}
      <section className="border rounded overflow-auto">
        <div className="flex items-center justify-between p-3 border-b">
          <div className="font-semibold">Despesas recorrentes</div>
          <button onClick={openCreateTpl} className="border rounded px-3 py-2">
            + Nova recorrente
          </button>
        </div>
        {templates.length === 0 ? (
          <div className="p-4">Nenhuma recorrente cadastrada.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Título</Th>
                <Th>Categoria</Th>
                <Th>Centro</Th>
                <Th>Frequência</Th>
                <Th>Vencimento</Th>
                <Th>Valor</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t">
                  <Td>{t.title}</Td>
                  <Td>{t.category || "-"}</Td>
                  <Td>{t.cost_center || "-"}</Td>
                  <Td>{t.frequency === "annual" ? "Anual" : "Mensal"}</Td>
                  <Td>
                    {t.frequency === "annual"
                      ? `Mês ${t.due_month} • Dia ${t.due_day}`
                      : `Dia ${t.due_day}`}
                  </Td>
                  <Td>{fmtBRL(t.amount)}</Td>
                  <Td>{t.active ? "ativo" : "inativo"}</Td>
                  <Td className="py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditTplModal(t)}
                        className="px-2 py-1 border rounded"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => onDeleteTpl(t)}
                        className="px-2 py-1 border rounded"
                      >
                        Excluir
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Modal: recorrente */}
      <Modal
        open={openEditTpl}
        onClose={() => setOpenEditTpl(false)}
        title={tplId ? "Editar recorrente" : "Nova recorrente"}
        footer={
          <>
            <button onClick={() => setOpenEditTpl(false)} className="px-3 py-2 border rounded">
              Cancelar
            </button>
            <button
              onClick={onSubmitTpl}
              disabled={savingTpl}
              className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50"
            >
              {savingTpl ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <form onSubmit={onSubmitTpl} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Título*</label>
            <input
              value={formTpl.title}
              onChange={(e) => setFormTpl((f) => ({ ...f, title: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Categoria</label>
            <input
              value={formTpl.category}
              onChange={(e) => setFormTpl((f) => ({ ...f, category: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Valor (R$)*</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formTpl.amount}
              onChange={(e) => setFormTpl((f) => ({ ...f, amount: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Centro de custos*</label>
            <select
              value={formTpl.cost_center}
              onChange={(e) => setFormTpl((f) => ({ ...f, cost_center: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            >
              <option value="PJ">PJ</option>
              <option value="PF">PF</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">Frequência*</label>
            <select
              value={formTpl.frequency}
              onChange={(e) => setFormTpl((f) => ({ ...f, frequency: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            >
              <option value="monthly">Mensal</option>
              <option value="annual">Anual</option>
            </select>
          </div>

          {formTpl.frequency === "annual" ? (
            <>
              <div>
                <label className="block text-sm mb-1">Mês</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={formTpl.due_month}
                  onChange={(e) => setFormTpl((f) => ({ ...f, due_month: e.target.value }))}
                  className="border rounded px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Dia</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={formTpl.due_day}
                  onChange={(e) => setFormTpl((f) => ({ ...f, due_day: e.target.value }))}
                  className="border rounded px-3 py-2 w-full"
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm mb-1">Dia de vencimento</label>
              <input
                type="number"
                min="1"
                max="28"
                value={formTpl.due_day}
                onChange={(e) => setFormTpl((f) => ({ ...f, due_day: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
              />
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={formTpl.active}
                onChange={(e) => setFormTpl((f) => ({ ...f, active: e.target.checked }))}
              />
              <span>Ativo</span>
            </label>
          </div>
        </form>
      </Modal>

      {/* Modal: lançamento avulso */}
      <Modal
        open={openAvulso}
        onClose={() => setOpenAvulso(false)}
        title="Lançamento avulso"
        footer={
          <>
            <button onClick={() => setOpenAvulso(false)} className="px-3 py-2 border rounded">
              Cancelar
            </button>
            <button
              onClick={onSubmitAvulso}
              disabled={savingAvulso}
              className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50"
            >
              {savingAvulso ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <form onSubmit={onSubmitAvulso} className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm mb-1">Data*</label>
            <input
              type="date"
              value={formAvulso.date}
              onChange={(e) => setFormAvulso((f) => ({ ...f, date: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Valor (R$)*</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formAvulso.amount}
              onChange={(e) => setFormAvulso((f) => ({ ...f, amount: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Título*</label>
            <input
              value={formAvulso.title}
              onChange={(e) => setFormAvulso((f) => ({ ...f, title: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Categoria</label>
            <input
              value={formAvulso.category}
              onChange={(e) => setFormAvulso((f) => ({ ...f, category: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Centro de custos*</label>
            <select
              value={formAvulso.cost_center}
              onChange={(e) => setFormAvulso((f) => ({ ...f, cost_center: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            >
              <option value="PJ">PJ</option>
              <option value="PF">PF</option>
            </select>
          </div>
        </form>
      </Modal>
    </main>
  );
}

function KpiCard({ title, value }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
function Th({ children }) {
  return <th className="text-left px-3 py-2 font-medium">{children}</th>;
}
function Td({ children }) {
  return <td className="px-3 py-2">{children}</td>;
}

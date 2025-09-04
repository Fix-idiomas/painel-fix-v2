"use client";

import { useEffect, useState } from "react";
import { financeGateway } from "@/lib/financeGateway";
import Modal from "@/components/Modal";
import Link from "next/link";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ProfessoresPage() {
  // filtro de mês
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal criar/editar professor
  const [openEdit, setOpenEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    status: "ativo",       // "ativo" | "inativo"
    hourly_rate: "0",
    pay_day: "5",          // 1..28
  });

  // Carrega e enriquece
  async function load() {
    setLoading(true);

    const toArray = (x) =>
      Array.isArray(x) ? x : Array.isArray(x?.data) ? x.data : Array.isArray(x?.rows) ? x.rows : [];

    const [teachersRaw, turmasRaw] = await Promise.all([
      financeGateway.listTeachers?.() ?? [],
      financeGateway.listTurmas?.() ?? [],
    ]);

    const teachers = toArray(teachersRaw);
    const turmas = toArray(turmasRaw);

    // agrupa turmas por professor
    const turmasByTeacher = new Map();
    for (const t of turmas) {
      const tid = t.teacher_id ?? null;
      if (!tid) continue;
      if (!turmasByTeacher.has(tid)) turmasByTeacher.set(tid, []);
      turmasByTeacher.get(tid).push(t);
    }

    const enriched = [];
    for (const prof of teachers) {
      // payout mensal (horas x R$/h)
      const payout =
        (await financeGateway.sumTeacherPayoutByMonth?.(prof.id, ym)) ?? {
          hours: 0,
          sessions: 0,
          amount: 0,
          hourly_rate: Number(prof.hourly_rate || 0),
          pay_day: Number(prof.pay_day || 5),
        };

      // contagem de alunos (ativos/inativos) nas turmas dele (sem duplicar)
      let activeCount = 0,
        inactiveCount = 0;
      const myTurmas = turmasByTeacher.get(prof.id) || [];
      const seen = new Set();
      for (const t of myTurmas) {
        try {
          const members = await financeGateway.listTurmaMembers?.(t.id);
          const arr = toArray(members);
          for (const m of arr) {
            if (!m?.id || seen.has(m.id)) continue;
            seen.add(m.id);
            if (m.status === "inativo") inactiveCount++;
            else activeCount++;
          }
        } catch {}
      }

      enriched.push({
        id: prof.id,
        name: prof.name ?? "(sem nome)",
        email: prof.email ?? "",
        phone: prof.phone ?? "",
        status: prof.status ?? "",
        turmas_count: myTurmas.length,

        // alunos
        students_active_count: activeCount,
        students_inactive_count: inactiveCount,

        // pagamento mês
        hourly_rate: Number(payout.hourly_rate || prof.hourly_rate || 0),
        pay_day: Number(payout.pay_day || prof.pay_day || 5),
        sessions_count: Number(payout.sessions || 0),
        hours_total: Number(payout.hours || 0),
        amount_total: Number(payout.amount || 0),
      });
    }

    setRows(enriched);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [ym]);

  // ---------- Modal: criar/editar ----------
  function openCreate() {
    setEditingId(null);
    setForm({
      name: "",
      email: "",
      phone: "",
      status: "ativo",
      hourly_rate: "0",
      pay_day: "5",
    });
    setOpenEdit(true);
  }
  function openEditModal(row) {
    setEditingId(row.id);
    setForm({
      name: row.name || "",
      email: row.email || "",
      phone: row.phone || "",
      status: row.status || "ativo",
      hourly_rate: String(row.hourly_rate ?? "0"),
      pay_day: String(row.pay_day ?? "5"),
    });
    setOpenEdit(true);
  }
  function closeEdit() {
    if (saving) return;
    setOpenEdit(false);
    setEditingId(null);
  }

  async function onSubmit(e) {
    e?.preventDefault?.();
    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        status: form.status || "ativo",
        hourly_rate: Number(form.hourly_rate || 0),
        pay_day: Math.min(Math.max(Number(form.pay_day || 5), 1), 28),
      };
      if (!payload.name) throw new Error("Nome é obrigatório.");

      if (editingId) {
        await financeGateway.updateTeacher(editingId, payload);
      } else {
        await financeGateway.createTeacher(payload);
      }
      setOpenEdit(false);
      setEditingId(null);
      await load();
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row) {
    if (!financeGateway.deleteTeacher) {
      alert("Excluir professor não está disponível neste ambiente.");
      return;
    }
    if (!confirm(`Excluir professor "${row.name}"?`)) return;
    try {
      await financeGateway.deleteTeacher(row.id);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Professores</h1>
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-sm mb-1">Mês de referência</label>
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value)}
              className="border rounded px-3 py-2"
            />
          </div>
          <button
            onClick={openCreate}
            className="border rounded px-3 py-2 self-start mt-6"
          >
            + Cadastrar professor
          </button>
        </div>
      </div>

      <section className="border rounded overflow-auto">
        {loading ? (
          <div className="p-4">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="p-4">Nenhum professor cadastrado.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Professor</Th>
                <Th>Turmas</Th>
                <Th>Alunos ativos</Th>
                <Th>Alunos inativos</Th>
                <Th>R$/hora</Th>
                <Th>Venc. (dia)</Th>
                <Th>Sessões (mês)</Th>
                <Th>Horas (mês)</Th>
                <Th>A pagar (mês)</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <Td>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-slate-500">
                      {r.email || r.phone
                        ? `${r.email || ""}${r.email && r.phone ? " • " : ""}${r.phone || ""}`
                        : "—"}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Status: <b>{r.status || "—"}</b>
                    </div>
                  </Td>
                  <Td>{r.turmas_count}</Td>
                  <Td>{r.students_active_count}</Td>
                  <Td>{r.students_inactive_count}</Td>
                  <Td>{fmtBRL(r.hourly_rate)}</Td>
                  <Td>{r.pay_day}</Td>
                  <Td>{r.sessions_count}</Td>
                  <Td>{r.hours_total.toFixed(2)}</Td>
                  <Td className="font-semibold">{fmtBRL(r.amount_total)}</Td>
                  <Td className="py-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(r)}
                        className="px-2 py-1 border rounded"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => onDelete(r)}
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

      {/* MODAL: Criar/Editar Professor */}
      <Modal
        open={openEdit}
        onClose={closeEdit}
        title={editingId ? "Editar professor" : "Cadastrar professor"}
        footer={
          <>
            <button
              onClick={closeEdit}
              className="px-3 py-2 border rounded disabled:opacity-50"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              onClick={onSubmit}
              className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Nome*</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm mb-1">E-mail</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Telefone</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">Valor hora (R$)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.hourly_rate}
              onChange={(e) => setForm((f) => ({ ...f, hourly_rate: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Dia de vencimento (1–28)</label>
            <input
              type="number"
              min="1"
              max="28"
              value={form.pay_day}
              onChange={(e) => setForm((f) => ({ ...f, pay_day: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>
        </form>
      </Modal>
    </main>
  );
}

function Th({ children }) {
  return <th className="text-left px-3 py-2 font-medium">{children}</th>;
}
function Td({ children }) {
  return <td className="px-3 py-2">{children}</td>;
}

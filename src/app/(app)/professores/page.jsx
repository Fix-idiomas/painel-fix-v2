"use client";

import { useEffect, useMemo, useState } from "react";
import { financeGateway } from "@/lib/financeGateway";
import Modal from "@/components/Modal";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

function fmtDateBR(d) {
  if (!d) return "—";
  const s = String(d);
  const isoLike = s.length > 10 ? s : `${s}T00:00:00`;
  const dt = new Date(isoLike);
  if (isNaN(dt)) {
    return s.slice(0, 10);
  }
  return dt.toLocaleDateString("pt-BR");
}

const monthNow = () => new Date().toISOString().slice(0, 7); // "YYYY-MM"

export default function ProfessoresPage() {
  const [teachers, setTeachers] = useState([]);
  const [turmas, setTurmas] = useState([]);
  const [students, setStudents] = useState([]);
  const [members, setMembers] = useState([]); // {turma_id, student_id}
  const [loading, setLoading] = useState(true);

  // competência (mês) para cálculo do pagamento
  const [ym, setYm] = useState(monthNow());
  const [payouts, setPayouts] = useState({}); // { [teacher_id]: {hours, sessions, amount, hourly_rate, pay_day} }

  // ---- Modal: criar/editar professor (igual à versão anterior)
  const [openEdit, setOpenEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    status: "ativo",
    hourly_rate: "0",
    pay_day: "5",
    rate_mode: "flat",
    rate_rules: [],
  });

  // ---- Modal: Detalhes do mês (NOVO)
  const [openDetails, setOpenDetails] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsTeacher, setDetailsTeacher] = useState(null);
  const [detailsSessions, setDetailsSessions] = useState([]); // [{id, turma_id, date, duration_hours, notes}]
  // map para achar nome da turma por id
  const turmaNameOf = useMemo(() => {
    const map = new Map();
    turmas.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [turmas]);

  async function load() {
    setLoading(true);

    const [ths, tms, sts] = await Promise.all([
      financeGateway.listTeachers(),
      financeGateway.listTurmas(),
      financeGateway.listStudents(),
    ]);

    // carrega membros de todas as turmas (para contagem de alunos por prof.)
    let allMems = [];
    for (const t of tms) {
      const ms = await financeGateway.listTurmaMembers(t.id);
      allMems = allMems.concat(ms.map((m) => ({ turma_id: t.id, student_id: m.id })));
    }

    setTeachers(ths);
    setTurmas(tms);
    setStudents(sts);
    setMembers(allMems);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // calcula os pagamentos (mês selecionado) para cada professor
  useEffect(() => {
    async function computePayouts() {
      const out = {};
      for (const t of teachers) {
        const p = await financeGateway.sumTeacherPayoutByMonth(t.id, ym);
        out[t.id] = p; // {hours, sessions, amount, hourly_rate, pay_day}
      }
      setPayouts(out);
    }
    if (teachers.length) computePayouts();
  }, [teachers, ym]);

  // linhas agregadas (contagens + mensalidades + payout)
  const rows = useMemo(() => {
    return teachers.map((th) => {
      const myTurmas = turmas.filter((t) => t.teacher_id === th.id).map((t) => t.id);
      const myMembers = members.filter((m) => myTurmas.includes(m.turma_id));
      const myStudents = myMembers
        .map((m) => students.find((s) => s.id === m.student_id))
        .filter(Boolean);

      const activeCount = myStudents.filter((s) => s.status === "ativo").length;
      const inactiveCount = myStudents.filter((s) => s.status !== "ativo").length;
      const sumMonthlyActive = myStudents
        .filter((s) => s.status === "ativo")
        .reduce((acc, s) => acc + Number(s.monthly_value || 0), 0);
      const sumMonthlyAll = myStudents.reduce(
        (acc, s) => acc + Number(s.monthly_value || 0),
        0
      );

      const pay = payouts[th.id] || {
        hours: 0,
        sessions: 0,
        amount: 0,
        hourly_rate: 0,
        pay_day: 5,
      };

      return {
        teacher: th,
        turmaCount: myTurmas.length,
        activeCount,
        inactiveCount,
        sumMonthlyActive,
        sumMonthlyAll,
        payout: pay,
      };
    });
  }, [teachers, turmas, members, students, payouts]);

  // ---------------- Modal Editar/Criar professor ----------------
  function openCreate() {
    setEditId(null);
    setForm({
      name: "",
      email: "",
      phone: "",
      status: "ativo",
      hourly_rate: "0",
      pay_day: "5",
      rate_mode: "flat",
      rate_rules: [],
    });
    setOpenEdit(true);
  }

  function openEditModal(t) {
    setEditId(t.id);
    setForm({
      name: t.name || "",
      email: t.email || "",
      phone: t.phone || "",
      status: t.status || "ativo",
      hourly_rate: String(t.hourly_rate ?? "0"),
      pay_day: String(t.pay_day ?? "5"),
      rate_mode: t.rate_mode || "flat",
      rate_rules: Array.isArray(t.rate_rules)
        ? t.rate_rules.map((r) => ({
            min: String(r.min ?? ""),
            max: String(r.max ?? ""),
            rate: String(r.rate ?? ""),
          }))
        : [],
    });
    setOpenEdit(true);
  }

  function closeEdit() {
    if (saving) return;
    setOpenEdit(false);
  }

  function addRule() {
    setForm((f) => ({
      ...f,
      rate_rules: [...(f.rate_rules || []), { min: "", max: "", rate: "" }],
    }));
  }
  function removeRule(idx) {
    setForm((f) => ({
      ...f,
      rate_rules: f.rate_rules.filter((_, i) => i !== idx),
    }));
  }
  function updateRule(idx, key, val) {
    setForm((f) => ({
      ...f,
      rate_rules: f.rate_rules.map((r, i) =>
        i === idx ? { ...r, [key]: val } : r
      ),
    }));
  }

  async function onSubmit(e) {
    e?.preventDefault?.();
    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        status: form.status,
        pay_day: Math.min(Math.max(Number(form.pay_day || 5), 1), 28),
      };
      if (form.rate_mode === "by_size") {
        payload.rate_mode = "by_size";
        payload.rate_rules = (form.rate_rules || [])
          .map((r) => ({
            min: Number(r.min || 0),
            max: Number(r.max || 0),
            hourly_rate: Number(r.rate || 0),
          }))
          .filter((r) => r.max >= r.min);
        payload.hourly_rate = Number(form.hourly_rate || 0); // fallback
      } else {
        payload.rate_mode = "flat";
        payload.hourly_rate = Number(form.hourly_rate || 0);
        payload.rate_rules = [];
      }

      if (editId) await financeGateway.updateTeacher(editId, payload);
      else await financeGateway.createTeacher(payload);

      setOpenEdit(false);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  // ---------------- Modal DETALHES do mês ----------------
  async function openDetailsForTeacher(teacher) {
    try {
      setDetailsLoading(true);
      setDetailsTeacher(teacher);
      setOpenDetails(true);
      const list = await financeGateway.listTeacherSessionsByMonth(teacher.id, ym);
      setDetailsSessions(list || []);
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setDetailsLoading(false);
    }
  }

  function closeDetails() {
    setOpenDetails(false);
    setDetailsTeacher(null);
    setDetailsSessions([]);
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Professores</h1>

        {/* seletor de mês para o cálculo do “A pagar” */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Competência:</label>
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value.slice(0, 7))}
            className="border rounded px-2 py-1"
          />
        </div>

        <button onClick={openCreate} className="border rounded px-3 py-2">
          + Cadastrar professor
        </button>
      </div>

      <section className="border rounded overflow-auto">
        {loading ? (
          <div className="p-4">Carregando…</div>
        ) : teachers.length === 0 ? (
          <div className="p-4">Nenhum professor cadastrado.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Nome</Th>
                <Th>Status</Th>
                <Th>Turmas</Th>
                <Th>Alunos ativos</Th>
                <Th>Alunos inativos</Th>
                <Th>Mensalidades (ativos)</Th>
                <Th>Mensalidades (todos)</Th>
                <Th>Tarifa</Th>
                <Th>A pagar (mês)</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(
                ({
                  teacher,
                  turmaCount,
                  activeCount,
                  inactiveCount,
                  sumMonthlyActive,
                  sumMonthlyAll,
                  payout,
                }) => (
                  <tr key={teacher.id} className="border-t">
                    <Td>{teacher.name}</Td>
                    <Td>{teacher.status}</Td>
                    <Td>{turmaCount}</Td>
                    <Td>{activeCount}</Td>
                    <Td>{inactiveCount}</Td>
                    <Td>{fmtBRL(sumMonthlyActive)}</Td>
                    <Td>{fmtBRL(sumMonthlyAll)}</Td>
                    <Td>
                      {teacher.rate_mode === "by_size"
                        ? "Por tamanho da turma"
                        : `Único: ${fmtBRL(teacher.hourly_rate)}/h`}
                    </Td>
                    <Td title={`Horas: ${payout.hours} • Sessões: ${payout.sessions}`}>
                      {fmtBRL(payout.amount)}
                    </Td>
                    <Td>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(teacher)}
                          className="px-2 py-1 border rounded"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => openDetailsForTeacher(teacher)}
                          className="px-2 py-1 border rounded"
                          title="Ver sessões e horas do mês"
                        >
                          Ver detalhes do mês
                        </button>
                      </div>
                    </Td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </section>

      {/* Modal criar/editar professor */}
      <Modal
        open={openEdit}
        onClose={closeEdit}
        title={editId ? "Editar professor" : "Cadastrar professor"}
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
            <label className="block text-sm mb-1">Dia de pagamento</label>
            <input
              type="number"
              min={1}
              max={28}
              value={form.pay_day}
              onChange={(e) => setForm((f) => ({ ...f, pay_day: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Modo de tarifa</label>
            <div className="flex gap-6">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="rate_mode"
                  checked={form.rate_mode === "flat"}
                  onChange={() => setForm((f) => ({ ...f, rate_mode: "flat" }))}
                />
                <span>Único (valor/hora fixo)</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="rate_mode"
                  checked={form.rate_mode === "by_size"}
                  onChange={() => setForm((f) => ({ ...f, rate_mode: "by_size" }))}
                />
                <span>Por tamanho da turma</span>
              </label>
            </div>
          </div>

          {form.rate_mode === "flat" ? (
            <div className="sm:col-span-2">
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
          ) : (
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-semibold">
                  Regras por tamanho de turma
                </label>
                <button
                  type="button"
                  onClick={addRule}
                  className="px-2 py-1 border rounded"
                >
                  + Adicionar regra
                </button>
              </div>
              <div className="border rounded overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Mín</Th>
                      <Th>Máx</Th>
                      <Th>R$/hora</Th>
                      <Th>Ações</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(form.rate_rules || []).length === 0 ? (
                      <tr>
                        <Td colSpan={4} className="p-3">
                          Nenhuma regra. Adicione pelo menos uma.
                        </Td>
                      </tr>
                    ) : (
                      form.rate_rules.map((r, idx) => (
                        <tr key={idx} className="border-t">
                          <Td>
                            <input
                              type="number"
                              min="0"
                              value={r.min}
                              onChange={(e) => updateRule(idx, "min", e.target.value)}
                              className="border rounded px-2 py-1 w-24"
                            />
                          </Td>
                          <Td>
                            <input
                              type="number"
                              min="0"
                              value={r.max}
                              onChange={(e) => updateRule(idx, "max", e.target.value)}
                              className="border rounded px-2 py-1 w-24"
                            />
                          </Td>
                          <Td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={r.rate}
                              onChange={(e) => updateRule(idx, "rate", e.target.value)}
                              className="border rounded px-2 py-1 w-28"
                            />
                          </Td>
                          <Td>
                            <button
                              type="button"
                              onClick={() => removeRule(idx)}
                              className="px-2 py-1 border rounded"
                            >
                              Remover
                            </button>
                          </Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Ex.: (1–1 → 50), (2–2 → 55), (3–99 → 60). Sessões já registradas
                não mudam se você alterar as regras (usamos snapshot).
              </p>
            </div>
          )}
        </form>
      </Modal>

      {/* Modal DETALHES do mês (NOVO) */}
      <Modal
        open={openDetails}
        onClose={closeDetails}
        title={
          detailsTeacher
            ? `Detalhes de ${detailsTeacher.name} — ${ym}`
            : "Detalhes do mês"
        }
        footer={
          <button onClick={closeDetails} className="px-3 py-2 border rounded">
            Fechar
          </button>
        }
      >
        {detailsLoading ? (
          <div className="p-4">Carregando…</div>
        ) : !detailsTeacher ? (
          <div className="p-4">Selecione um professor.</div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm">
              <b>Resumo do mês:</b>{" "}
              {(() => {
                const p = payouts[detailsTeacher.id] || {
                  hours: 0,
                  sessions: 0,
                  amount: 0,
                };
                return `Sessões: ${p.sessions} • Horas: ${p.hours} • A pagar: ${fmtBRL(
                  p.amount
                )}`;
              })()}
            </div>

            <div className="border rounded overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Data</Th>
                    <Th>Turma</Th>
                    <Th>Duração (h)</Th>
                    <Th>Observação</Th>
                  </tr>
                </thead>
                <tbody>
                  {detailsSessions.length === 0 ? (
                    <tr>
                      <Td colSpan={4} className="p-3">
                        Nenhuma sessão encontrada para este mês.
                      </Td>
                    </tr>
                  ) : (
                    detailsSessions.map((s) => (
                      <tr key={s.id} className="border-t">
                        <Td>{fmtDateBR(s.date)}</Td>
                        <Td>{turmaNameOf.get(s.turma_id) || s.turma_id}</Td>
                        <Td>{Number(s.duration_hours || 0)}</Td>
                        <Td>{s.notes || "—"}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}

function Th({ children }) {
  return <th className="text-left px-3 py-2 font-medium">{children}</th>;
}
function Td({ children, colSpan, className = "" }) {
  return (
    <td colSpan={colSpan} className={`px-3 py-2 ${className}`}>
      {children}
    </td>
  );
}

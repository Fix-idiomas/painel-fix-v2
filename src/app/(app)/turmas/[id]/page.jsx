"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Modal from "@/components/Modal";
import { financeGateway } from "@/lib/financeGateway";
// ⚠️ Ajuste esta importação conforme seu SessionContext exporta:
// Se você tiver um hook `useSession()`, use assim. Se exporta o próprio contexto,
// troque para useContext(SessionContext).
import { useSession } from "@/contexts/SessionContext";
import { useSearchParams } from "next/navigation";


const WEEKDAYS = [
  { value: "1", label: "Segunda" },
  { value: "2", label: "Terça" },
  { value: "3", label: "Quarta" },
  { value: "4", label: "Quinta" },
  { value: "5", label: "Sexta" },
  { value: "6", label: "Sábado" },
  { value: "0", label: "Domingo" },
];
const labelWeekday = (n) => {
  const found = WEEKDAYS.find((w) => Number(w.value) === Number(n));
  return found ? found.label : "—";
};

const fmtBR = (s) => {
  if (!s) return "-";
  const str = String(s);
  const input = str.length <= 10 ? `${str}T00:00:00` : str; // só adiciona hora se vier só a data
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("pt-BR");
};
const fmtNum = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
// mês atual no formato yyyy-mm para o link do relatório
const ym = new Date().toISOString().slice(0, 7);

const fmtDuration = (h) =>
  Number(h || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const describeRule = (r) => {
  const w = r.weekday === 0 || r.weekday ? labelWeekday(r.weekday) : "—";
  const hhmm = r.time ? `às ${r.time}` : "";
  const dur = r.duration_hours ? ` • ${fmtDuration(r.duration_hours)}h` : "";
  return `${w} ${hhmm}${dur}`.trim();
};

// Helpers RBAC
const norm = (v) => (v === undefined || v === null ? "" : String(v));

export default function TurmaDetailPage() {
const router = useRouter();
const search = useSearchParams();
const params = useParams();
const turmaId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  // --- Sessão / RBAC ---
  const sessionCtx = useSession?.() ?? {};
  const session = sessionCtx.session ?? sessionCtx;
  const ready = sessionCtx.ready ?? true;
  const role = session?.role ?? "admin";
  const teacherId = session?.teacherId ?? null;
  const isProfessor = role === "professor";

  const [turma, setTurma] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [members, setMembers] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // ---- turma (somente admin/financeiro)
  const [openEdit, setOpenEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [formTurma, setFormTurma] = useState({
    name: "",
    teacher_id: "",
    capacity: 20,
    meeting_rules: [],
  });

  // ---- sessão (professor pode criar/editar)
  const [openSess, setOpenSess] = useState(false);
  const [savingSess, setSavingSess] = useState(false);
  const [editingSessId, setEditingSessId] = useState(null);
  const [formSess, setFormSess] = useState({ date: "", notes: "", duration_hours: "0.5" });
  const [attendanceDraft, setAttendanceDraft] = useState([]); // [{student_id, name, present, note}]
  const [allPresent, setAllPresent] = useState(false);
  const searchParams = useSearchParams();
  const [openedFromQuery, setOpenedFromQuery] = useState(false);


  // ---- membros (somente admin/financeiro)
  const [addStudentId, setAddStudentId] = useState("");

  // Tenta obter um teacherId efetivo para professor
  const effectiveTeacherId = useMemo(() => {
    if (!isProfessor) return null;
    if (teacherId) return norm(teacherId);
    // inferir por user_id
    const byUser = teachers.find((t) => norm(t.user_id ?? t.userId) === norm(session?.userId));
    if (byUser?.id) return norm(byUser.id);
    // fallback por nome
    const byName = teachers.find(
      (t) => (t.name || "").trim() === (session?.name || "").trim()
    );
    if (byName?.id) return norm(byName.id);
    return null;
  }, [isProfessor, teacherId, teachers, session?.userId, session?.name]);

  async function loadAll() {
    setLoading(true);

    const [turmas, ths, mbs, studs, sess] = await Promise.all([
      financeGateway.listTurmas(),
      financeGateway.listTeachers(),
      financeGateway.listTurmaMembers(turmaId),
      financeGateway.listStudents(),
      financeGateway.listSessions(turmaId),
    ]);

    const t = turmas.find((x) => x.id === turmaId);
    if (!t) {
      alert("Turma não encontrada.");
      router.push("/turmas");
      return;
    }

    setTurma(t);
    setTeachers(ths);
    setMembers(mbs);
    setAllStudents(studs);
    setSessions(sess);
    setLoading(false);
  }

  useEffect(() => {
    if (!ready || !turmaId) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, turmaId]);

  // Se professor tentar abrir turma que não é dele, bloqueia
  useEffect(() => {
    if (!ready || !isProfessor || !turma) return;
    if (!effectiveTeacherId) return; // Mostramos aviso na UI; sem teacherId efetivo, não dá para validar
    if (norm(turma.teacher_id ?? turma.teacherId) !== effectiveTeacherId) {
      alert("Você não tem acesso a esta turma.");
      router.replace("/turmas");
    }
  }, [ready, isProfessor, turma, effectiveTeacherId, router]);

  const teacherName = useMemo(() => {
    if (!turma?.teacher_id) return "—";
    return teachers.find((t) => t.id === turma.teacher_id)?.name || "—";
  }, [teachers, turma]);

  const candidates = useMemo(() => {
    const inTurma = new Set(members.map((m) => m.id));
    return allStudents
      .filter((s) => s.status === "ativo" && !inTurma.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allStudents, members]);

  // turma (somente admin/financeiro)
  function openEditTurma() {
    if (isProfessor) return; // RBAC
    setFormTurma({
      name: turma?.name || "",
      teacher_id: turma?.teacher_id || "",
      capacity: turma?.capacity || 20,
      meeting_rules: Array.isArray(turma?.meeting_rules)
        ? turma.meeting_rules.map((r) => ({
            weekday: r.weekday === 0 || r.weekday ? String(r.weekday) : "",
            time: r.time || "",
            duration_hours: String(r.duration_hours ?? "0.5"),
          }))
        : [],
    });
    setOpenEdit(true);
  }
  function closeEditTurma() {
    if (savingEdit) return;
    setOpenEdit(false);
  }
  async function onSubmitTurma(e) {
    e?.preventDefault?.();
    if (isProfessor) return; // RBAC
    try {
      setSavingEdit(true);
      await financeGateway.updateTurma(turma.id, {
        name: (formTurma.name || "").trim(),
        teacher_id: formTurma.teacher_id || null,
        capacity: Number(formTurma.capacity || 20),
        meeting_rules: (formTurma.meeting_rules || []).map((r) => ({
          weekday: r.weekday === "" ? null : Number(r.weekday),
          time: r.time || null,
          duration_hours: Number(r.duration_hours || 0.5),
        })),
      });
      setOpenEdit(false);
      await loadAll();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSavingEdit(false);
    }
  }

  // sessão (professor pode criar/editar)
  function computeAllPresent(arr) {
    if (!arr || arr.length === 0) return false;
    return arr.every((r) => !!r.present);
  }
  function recomputeAllPresentFromDraft(nextDraft) {
    setAllPresent(nextDraft.length > 0 && nextDraft.every((r) => !!r.present));
  }
  function openCreateSession() {
    setEditingSessId(null);
    setFormSess({
      date: "",
      notes: "",
      duration_hours: String(turma?.meeting_duration_default ?? "0.5"),
    });
    const draft = members.map((m) => ({
      student_id: m.id,
      name: m.name,
      present: false, // por padrão AUSENTE
      note: "",
    }));
    setAttendanceDraft(draft);
    setAllPresent(computeAllPresent(draft));
    setOpenSess(true);
  }
  async function openEditSession(s) {
    setEditingSessId(s.id);
    setFormSess({
      date: s.date || "",
      notes: s.notes || "",
      duration_hours: String(s.duration_hours ?? "0.5"),
    });
    const rows = await financeGateway.listAttendance(s.id);
    const byStu = new Map(rows.map((r) => [r.student_id, r]));
    const draft = members.map((m) => ({
      student_id: m.id,
      name: m.name,
      present: byStu.get(m.id)?.present ?? false,
      note: byStu.get(m.id)?.note ?? "",
    }));
    setAttendanceDraft(draft);
    setAllPresent(computeAllPresent(draft));
    setOpenSess(true);
  }
  function closeSess() {
    if (savingSess) return;
    setOpenSess(false);
  }
  function setAllPresentValue(value) {
    const next = !!value;
    setAllPresent(next);
    const draft = attendanceDraft.map((r) => ({ ...r, present: next }));
    setAttendanceDraft(draft);
  }
  async function onSubmitSess(e) {
    e?.preventDefault?.();
    try {
      setSavingSess(true);
      if (!formSess.date) throw new Error("Data é obrigatória.");

      const enrolledNow = members.filter((m) => m.status === "ativo").length;

      const payload = {
        date: formSess.date,
        notes: formSess.notes,
        duration_hours: Number(formSess.duration_hours || 0.5),
        headcount_snapshot: enrolledNow,
      };

      let sessionId = editingSessId;
      if (editingSessId) {
        await financeGateway.updateSession(editingSessId, payload);
      } else {
        const created = await financeGateway.createSession({
          turma_id: turma.id,
          ...payload,
        });
        sessionId = created?.id;
      }

      if (!sessionId) throw new Error("Falha ao obter o ID da sessão.");
      for (const row of attendanceDraft) {
        await financeGateway.upsertAttendance(sessionId, row.student_id, {
          present: !!row.present,
          note: row.note || "",
        });
      }

      setOpenSess(false);
      await loadAll();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSavingSess(false);
    }
  }
  async function onDeleteSess(s) {
    if (!confirm(`Excluir sessão de ${fmtBR(s.date)}?`)) return;
    await financeGateway.deleteSession(s.id);
    await loadAll();
  }

  // membros (somente admin/financeiro)
  async function onAddMember() {
    if (isProfessor) return; // RBAC
    if (!addStudentId) return;
    await financeGateway.addStudentToTurma(turma.id, addStudentId);
    setAddStudentId("");
    await loadAll();
  }
  async function onRemoveMember(student_id) {
    if (isProfessor) return; // RBAC
    if (!confirm("Remover aluno desta turma?")) return;
    await financeGateway.removeStudentFromTurma(turma.id, student_id);
    await loadAll();
  }

  useEffect(() => {
    router.replace(`/turmas/${turmaId}`, { scroll: false });
  }, [search, router, turmaId]);

  if (!ready) return <main className="p-6">Preparando sessão…</main>;
  if (loading) return <main className="p-6">Carregando…</main>;
  if (!turma) return null;

  const professorSemVinculo =
    isProfessor && !effectiveTeacherId && (teachers?.length ?? 0) > 0;

  return (
    <main className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{turma.name}</h1>

          {professorSemVinculo && (
            <div className="mt-2 text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 border border-amber-200">
              Professor sem vínculo detectado. Defina <code>session.teacherId</code> ou crie um
              professor com <code>user_id</code> = <code>{session?.userId || "?"}</code> no mock.
            </div>
          )}

          <div className="text-slate-600 mt-2">
            Professor: <b>{teacherName}</b> • Capacidade: <b>{turma.capacity}</b> • Alunos:{" "}
            <b>{members.length}</b>
            <br className="hidden sm:block" />
            Encontros:{" "}
            <b>
              {Array.isArray(turma.meeting_rules) && turma.meeting_rules.length > 0
                ? turma.meeting_rules.map(describeRule).join("; ")
                : "—"}
            </b>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => router.push("/turmas")} className="border rounded px-3 py-2">
            Voltar
          </button>

          {/* 🔒 Editar turma: apenas não-professor */}
          {!isProfessor && (
            <button onClick={openEditTurma} className="border rounded px-3 py-2">
              Editar turma
            </button>
          )}

          {/* Relatório liberado para todos (se quiser restringir, mova para !isProfessor) */}
          <Link
            href={`/relatorios/assiduidade?turma=${turma.id}&ym=${ym}`}
            className="border rounded px-3 py-2"
          >
            Relatório
          </Link>
        </div>
      </div>

      {/* Alunos (somente não-professor enxerga controles) */}
      <section className="border rounded overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b">
          <h2 className="font-semibold">Alunos da turma</h2>

          {!isProfessor && (
            <div className="flex gap-2">
              <select
                value={addStudentId}
                onChange={(e) => setAddStudentId(e.target.value)}
                className="border rounded px-3 py-2 min-w-[260px]"
              >
                <option value="">— adicionar aluno (somente ativos) —</option>
                {candidates.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button onClick={onAddMember} className="border rounded px-3 py-2">
                Adicionar
              </button>
            </div>
          )}
        </div>

        {members.length === 0 ? (
          <div className="p-4">Nenhum aluno nesta turma.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Aluno</Th>
                <Th>Status</Th>
                {!isProfessor && <Th>Ações</Th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t">
                  <Td>{m.name}</Td>
                  <Td>{m.status}</Td>
                  {!isProfessor && (
                    <Td className="py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => onRemoveMember(m.id)}
                          className="px-2 py-1 border rounded"
                        >
                          Remover
                        </button>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Sessões */}
      <section className="border rounded">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Aulas / Sessões</h2>
          <button onClick={openCreateSession} className="border rounded px-3 py-2">
            + Criar sessão
          </button>
        </div>

        {sessions.length === 0 ? (
          <div className="p-4">Nenhuma sessão cadastrada.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Data</Th>
                <Th>Duração (h)</Th>
                <Th>Resumo</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-t">
                  <Td>{fmtBR(s.date)}</Td>
                  <Td>{fmtNum(s.duration_hours)}</Td>
                  <Td>{s.notes || "—"}</Td>
                  <Td className="py-2">
                    <div className="flex gap-2">
                      <button onClick={() => openEditSession(s)} className="px-2 py-1 border rounded">
                        Abrir / Editar
                      </button>
                      <button onClick={() => onDeleteSess(s)} className="px-2 py-1 border rounded">
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

      {/* MODAL: Editar Turma (somente não-professor) */}
      {!isProfessor && (
        <Modal
          open={openEdit}
          onClose={closeEditTurma}
          title="Editar turma"
          footer={
            <>
              <button
                onClick={closeEditTurma}
                className="px-3 py-2 border rounded disabled:opacity-50"
                disabled={savingEdit}
              >
                Cancelar
              </button>
              <button
                onClick={onSubmitTurma}
                className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50"
                disabled={savingEdit}
              >
                {savingEdit ? "Salvando…" : "Salvar"}
              </button>
            </>
          }
        >
          <form onSubmit={onSubmitTurma} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm mb-1">Nome*</label>
              <input
                value={formTurma.name}
                onChange={(e) => setFormTurma((f) => ({ ...f, name: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Professor</label>
              <select
                value={formTurma.teacher_id}
                onChange={(e) => setFormTurma((f) => ({ ...f, teacher_id: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
              >
                <option value="">— sem professor —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1">Capacidade</label>
              <input
                type="number"
                min="1"
                value={formTurma.capacity}
                onChange={(e) => setFormTurma((f) => ({ ...f, capacity: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
              />
            </div>

            {/* Encontros (vários) */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">Encontros na semana</label>
                <button
                  type="button"
                  onClick={() =>
                    setFormTurma((f) => ({
                      ...f,
                      meeting_rules: [
                        ...(f.meeting_rules || []),
                        { weekday: "", time: "", duration_hours: "0.5" },
                      ],
                    }))
                  }
                  className="px-2 py-1 border rounded text-sm"
                >
                  + Adicionar encontro
                </button>
              </div>

              {(formTurma.meeting_rules || []).length === 0 ? (
                <div className="text-slate-500 text-sm">Nenhum encontro definido.</div>
              ) : (
                <div className="space-y-4">
                  {(formTurma.meeting_rules || []).map((r, idx) => (
                    <div key={idx} className="grid sm:grid-cols-4 gap-3 items-end border rounded p-3">
                      {/* Dia */}
                      <div>
                        <label className="block text-xs mb-1">Dia da semana</label>
                        <select
                          value={r.weekday}
                          onChange={(e) =>
                            setFormTurma((f) => {
                              const next = [...(f.meeting_rules || [])];
                              next[idx] = { ...next[idx], weekday: e.target.value };
                              return { ...f, meeting_rules: next };
                            })
                          }
                          className="border rounded px-3 py-2 w-full"
                        >
                          <option value="">—</option>
                          {WEEKDAYS.map((w) => (
                            <option key={w.value} value={w.value}>
                              {w.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Hora */}
                      <div>
                        <label className="block text-xs mb-1">Hora</label>
                        <input
                          type="time"
                          value={r.time}
                          onChange={(e) =>
                            setFormTurma((f) => {
                              const next = [...(f.meeting_rules || [])];
                              next[idx] = { ...next[idx], time: e.target.value };
                              return { ...f, meeting_rules: next };
                            })
                          }
                          className="border rounded px-3 py-2 w-full"
                        />
                      </div>

                      {/* Duração */}
                      <div>
                        <label className="block text-xs mb-1">Duração (h)</label>
                        <select
                          value={r.duration_hours}
                          onChange={(e) =>
                            setFormTurma((f) => {
                              const next = [...(f.meeting_rules || [])];
                              next[idx] = { ...next[idx], duration_hours: e.target.value };
                              return { ...f, meeting_rules: next };
                            })
                          }
                          className="border rounded px-3 py-2 w-full"
                        >
                          <option value="0.5">0,5</option>
                          <option value="1">1,0</option>
                          <option value="1.5">1,5</option>
                          <option value="2">2,0</option>
                        </select>
                      </div>

                      {/* Remover */}
                      <div className="justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setFormTurma((f) => {
                              const next = [...(f.meeting_rules || [])];
                              next.splice(idx, 1);
                              return { ...f, meeting_rules: next };
                            })
                          }
                          className="px-3 py-2 border rounded"
                          title="Remover"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL: Criar/Editar Sessão (UNIFICADO) */}
      <Modal
        open={openSess}
        onClose={closeSess}
        title={editingSessId ? "Editar sessão" : "Criar sessão"}
        footer={
          <>
            <button
              onClick={closeSess}
              className="px-3 py-2 border rounded disabled:opacity-50"
              disabled={savingSess}
            >
              Cancelar
            </button>
            <button
              onClick={onSubmitSess}
              className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50"
              disabled={savingSess}
            >
              {savingSess ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <form onSubmit={onSubmitSess} className="grid gap-4">
          {/* Geral */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="block text-sm mb-1">Data*</label>
              <input
                type="date"
                value={formSess.date}
                onChange={(e) => setFormSess((f) => ({ ...f, date: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-sm mb-1">Duração (h)*</label>
              <select
                value={formSess.duration_hours}
                onChange={(e) => setFormSess((f) => ({ ...f, duration_hours: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
                required
              >
                <option value="0.5">0,5 h (30 min)</option>
                <option value="1">1 h</option>
                <option value="1.5">1,5 h</option>
                <option value="2">2 h</option>
              </select>
            </div>
            <div className="sm:col-span-1 flex items-end gap-3">
              <button
                type="button"
                onClick={() => setAllPresentValue(true)}
                className="px-3 py-2 border rounded"
                title="Marcar todos como presentes"
              >
                Todos presentes
              </button>
              <button
                type="button"
                onClick={() => setAllPresentValue(false)}
                className="px-3 py-2 border rounded"
                title="Marcar todos como ausentes"
              >
                Todos ausentes
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1">Resumo / Observação geral</label>
            <textarea
              value={formSess.notes}
              onChange={(e) => setFormSess((f) => ({ ...f, notes: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              rows={4}
            />
          </div>

          {/* Individuais */}
          {members.length === 0 ? (
            <div className="p-2 text-slate-600">
              Adicione alunos à turma para registrar presenças.
            </div>
          ) : (
            <div className="border rounded overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <Th>Aluno</Th>
                    <Th>Presença</Th>
                    <Th>Observação individual</Th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceDraft.map((row) => (
                    <tr key={row.student_id} className="border-t">
                      <Td className="whitespace-nowrap">{row.name}</Td>
                      <Td>
                        <div className="flex items-center gap-4">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name={`presenca_${row.student_id}`}
                              checked={!!row.present}
                              onChange={() => {
                                const next = attendanceDraft.map((x) =>
                                  x.student_id === row.student_id ? { ...x, present: true } : x
                                );
                                setAttendanceDraft(next);
                                recomputeAllPresentFromDraft(next);
                              }}
                            />
                            <span>Presente</span>
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name={`presenca_${row.student_id}`}
                              checked={!row.present}
                              onChange={() => {
                                const next = attendanceDraft.map((x) =>
                                  x.student_id === row.student_id ? { ...x, present: false } : x
                                );
                                setAttendanceDraft(next);
                                recomputeAllPresentFromDraft(next);
                              }}
                            />
                            <span>Ausente</span>
                          </label>
                        </div>
                      </Td>
                      <Td>
                        <input
                          value={row.note || ""}
                          onChange={(e) => {
                            const next = attendanceDraft.map((x) =>
                              x.student_id === row.student_id ? { ...x, note: e.target.value } : x
                            );
                            setAttendanceDraft(next);
                          }}
                          className="border rounded px-3 py-2 w-full"
                          placeholder="Observação pessoal (opcional)"
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

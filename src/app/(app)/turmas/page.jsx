"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";
import { financeGateway } from "@/lib/financeGateway";
// ⚠️ Ajuste esta importação conforme seu SessionContext exporta:
// - se você tiver `export function useSession() { ... }`, use a linha abaixo.
// - se exporta o próprio contexto, troque para useContext(SessionContext).
import { useSession } from "@/contexts/SessionContext";

// Helpers
const norm = (v) => (v === undefined || v === null ? "" : String(v));

function teacherMatchesTurma(turma, teacherIdEff, teacherNameEff) {
  const tid = norm(teacherIdEff);
  const tname = (teacherNameEff || "").trim();

  const directMatches = [
    norm(turma.teacher_id),
    norm(turma.teacherId),
    norm(turma.teacher_uuid),
    norm(turma.teacher?.id),
  ];
  if (tid && directMatches.some((x) => x && norm(x) === tid)) return true;

  // Fallback por nome (caso IDs não coincidam)
  const turmaTeacherName =
    (turma.teacher_name ??
      turma.teacher?.name ??
      turma.teacherName ??
      "").trim();

  if (tname && turmaTeacherName && turmaTeacherName === tname) return true;

  return false;
}

export default function TurmasPage() {
  // --- Sessão / RBAC ---
  const sessionCtx = useSession?.() ?? {};
  const session = sessionCtx.session ?? sessionCtx; // compat: alguns projetos retornam direto
  const ready = sessionCtx.ready ?? true;
  const role = session?.role ?? "admin";
  const teacherId = session?.teacherId ?? null;
  const isProfessor = role === "professor";

  const [turmas, setTurmas] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  // seleção para gerenciar membros
  const [selectedTurma, setSelectedTurma] = useState(null);
  const [members, setMembers] = useState([]); // alunos na turma selecionada

  // modal criar/editar turma
  const [openEditTurma, setOpenEditTurma] = useState(false);
  const [savingTurma, setSavingTurma] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formTurma, setFormTurma] = useState({ name: "", teacher_id: "", capacity: 20 });

  // modal gerenciar alunos
  const [openManage, setOpenManage] = useState(false);
  const [savingManage, setSavingManage] = useState(false);
  const [addStudentId, setAddStudentId] = useState("");

  async function load() {
    setLoading(true);

    // 1) carrega dados base
    const [ts, ths, sts] = await Promise.all([
      financeGateway.listTurmas?.() ?? [],
      financeGateway.listTeachers?.() ?? [],
      financeGateway.listStudents?.() ?? [],
    ]);

    setTeachers(ths);
    setStudents(sts);

    // 2) mapa de professores
    const teacherById = Object.fromEntries((ths || []).map((t) => [t.id, t]));

    // 3) enriquece cada turma com teacher_name e students_count
    const toArray = (x) =>
      Array.isArray(x) ? x : Array.isArray(x?.data) ? x.data : Array.isArray(x?.rows) ? x.rows : [];

    async function countMembers(turmaId, t) {
      if (typeof financeGateway.countStudentsInTurma === "function") {
        try {
          const n = await financeGateway.countStudentsInTurma(turmaId);
          return Number(n || 0);
        } catch {}
      }
      if (typeof financeGateway.listTurmaMembers === "function") {
        try {
          const m = await financeGateway.listTurmaMembers(turmaId);
          return toArray(m).length;
        } catch {}
      }
      if (Array.isArray(t?.student_ids)) return t.student_ids.length;
      if (typeof t?.students_count === "number") return t.students_count;
      return 0;
    }

    const enriched = await Promise.all(
      toArray(ts).map(async (t) => {
        const teacher_name = t.teacher_name ?? teacherById[t.teacher_id]?.name ?? "-";
        const students_count = await countMembers(t.id, t);
        return { ...t, teacher_name, students_count };
      })
    );

    setTurmas(enriched);
    setLoading(false);
  }

  useEffect(() => {
    if (!ready) return; // evita carregar antes da sessão estar pronta
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);



  // Tenta obter um teacherId/Name efetivo para professor
  const { effectiveTeacherId, effectiveTeacherName } = useMemo(() => {
    if (!isProfessor) return { effectiveTeacherId: null, effectiveTeacherName: null };

    // 1) direto da sessão
    if (teacherId) return { effectiveTeacherId: norm(teacherId), effectiveTeacherName: session?.name || null };

    // 2) inferir pelo user_id
    const byUser = teachers.find((t) => norm(t.user_id ?? t.userId) === norm(session?.userId));
    if (byUser?.id) return { effectiveTeacherId: norm(byUser.id), effectiveTeacherName: byUser.name || null };

    // 3) fallback por nome da sessão
    const byName = teachers.find((t) => (t.name || "").trim() === (session?.name || "").trim());
    if (byName?.id) return { effectiveTeacherId: norm(byName.id), effectiveTeacherName: byName.name || null };

    return { effectiveTeacherId: null, effectiveTeacherName: (session?.name || null) };
  }, [isProfessor, teacherId, teachers, session?.userId, session?.name]);

  // 🔒 RBAC: professor vê só as próprias turmas (robusto)
  const visibleTurmas = useMemo(() => {
    if (!isProfessor) return turmas;

    // Se não conseguimos inferir nada, mostra lista vazia (com diagnóstico na UI)
    if (!effectiveTeacherId && !effectiveTeacherName) return [];

    return turmas.filter((t) =>
      teacherMatchesTurma(t, effectiveTeacherId, effectiveTeacherName)
    );
  }, [turmas, isProfessor, effectiveTeacherId, effectiveTeacherName]);

  async function openManageMembers(t) {
    // 🔒 professor não pode gerenciar alunos
    if (isProfessor) {
      alert("Professores não podem gerenciar alunos da turma.");
      return;
    }
    setSelectedTurma(t);
    const m = await financeGateway.listTurmaMembers(t.id);
    setMembers(m);
    setAddStudentId("");
    setOpenManage(true);
  }

  function openCreateTurma() {
    // 🔒 professor não cria turmas
    if (isProfessor) return;
    setEditingId(null);
    setFormTurma({ name: "", teacher_id: "", capacity: 20 });
    setOpenEditTurma(true);
  }
  function openEditTurmaModal(t) {
    // 🔒 professor não edita turmas
    if (isProfessor) return;
    setEditingId(t.id);
    setFormTurma({ name: t.name || "", teacher_id: t.teacher_id || "", capacity: t.capacity || 20 });
    setOpenEditTurma(true);
  }
  function closeEditTurma() {
    if (savingTurma) return;
    setOpenEditTurma(false);
    setEditingId(null);
  }

  async function onSubmitTurma(e) {
    e?.preventDefault?.();
    try {
      setSavingTurma(true);
      const payload = {
        name: formTurma.name.trim(),
        teacher_id: formTurma.teacher_id || null,
        capacity: Number(formTurma.capacity || 20),
      };
      if (!payload.name) throw new Error("Nome é obrigatório.");

      if (editingId) {
        await financeGateway.updateTurma(editingId, payload);
      } else {
        await financeGateway.createTurma(payload);
      }
      closeEditTurma();
      await load();
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSavingTurma(false);
    }
  }

  async function onDeleteTurma(t) {
    // 🔒 professor não exclui turmas
    if (isProfessor) return;
    if (!confirm(`Excluir turma "${t.name}"?`)) return;
    try {
      await financeGateway.deleteTurma(t.id);
      if (selectedTurma?.id === t.id) setOpenManage(false);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function onAddMember() {
    if (!selectedTurma || !addStudentId) return;
    try {
      setSavingManage(true);
      await financeGateway.addStudentToTurma(selectedTurma.id, addStudentId);
      const m = await financeGateway.listTurmaMembers(selectedTurma.id);
      setMembers(m);
      setAddStudentId("");
      await load(); // atualiza contadores na listagem
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSavingManage(false);
    }
  }

  async function onRemoveMember(student_id) {
    if (!selectedTurma) return;
    try {
      setSavingManage(true);
      await financeGateway.removeStudentFromTurma(selectedTurma.id, student_id);
      const m = await financeGateway.listTurmaMembers(selectedTurma.id);
      setMembers(m);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSavingManage(false);
    }
  }

  // alunos que NÃO estão nesta turma (para o select)
  const candidates = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id));
    return students.filter((s) => !memberIds.has(s.id));
  }, [students, members]);

  // Espera o ready para evitar hydration mismatch
  if (!ready) {
    return (
      <main className="p-6">
        <div className="animate-pulse text-sm text-gray-500">Preparando sessão…</div>
      </main>
    );
  }

  return (
    <main className="p-6 space-y-6">

      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-2xl font-bold">Turmas</h1>
          {isProfessor && !effectiveTeacherId && (
            <div className="ml-4 text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 border border-amber-200">
              Sem professor vinculado à sessão. Defina <code>session.teacherId</code> ou crie um professor
              com <code>user_id</code> = <code>{session?.userId || "?"}</code> (mock).
            </div>
          )}
        </div>
        {/* 🔒 Professor não pode criar turmas */}
        {!isProfessor && (
          <button onClick={openCreateTurma} className="border rounded px-3 py-2">
            + Criar turma
          </button>
        )}
      </div>

      <section className="border rounded overflow-auto">
        {loading ? (
          <div className="p-4">Carregando…</div>
        ) : visibleTurmas.length === 0 ? (
          <div className="p-4">Nenhuma turma encontrada.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Nome</Th>
                <Th>Professor</Th>
                <Th>Capacidade</Th>
                <Th>Alunos</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {visibleTurmas.map((t) => (
                <tr key={t.id} className="border-t">
                  <Td>
                    <Link href={`/turmas/${t.id}`} className="underline hover:no-underline">
                      {t.name}
                    </Link>
                  </Td>
                  <Td>{t.teacher_name ?? "-"}</Td>
                  <Td>{t.capacity}</Td>
                  <Td>{t.students_count}</Td>
                  <Td className="py-2">
                    <div className="flex gap-2">
                      <Link href={`/turmas/${t.id}`} className="px-2 py-1 border rounded">
                        Abrir
                      </Link>

                      {/* 🔒 Botões restritos a não-professor */}
                      {!isProfessor && (
                        <>
                          <button
                            onClick={() => openManageMembers(t)}
                            className="px-2 py-1 border rounded"
                          >
                            Gerenciar
                          </button>
                          <button
                            onClick={() => openEditTurmaModal(t)}
                            className="px-2 py-1 border rounded"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => onDeleteTurma(t)}
                            className="px-2 py-1 border rounded"
                          >
                            Excluir
                          </button>
                        </>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Modal CRIAR/EDITAR TURMA (não professor) */}
      {!isProfessor && (
        <Modal
          open={openEditTurma}
          onClose={closeEditTurma}
          title={editingId ? "Editar turma" : "Criar turma"}
          footer={
            <>
              <button
                onClick={closeEditTurma}
                className="px-3 py-2 border rounded disabled:opacity-50"
                disabled={savingTurma}
              >
                Cancelar
              </button>
              <button
                onClick={onSubmitTurma}
                className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50"
                disabled={savingTurma}
              >
                {savingTurma ? "Salvando…" : "Salvar"}
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
          </form>
        </Modal>
      )}

      {/* Modal GERENCIAR ALUNOS DA TURMA (não professor) */}
      {!isProfessor && (
        <Modal
          open={openManage}
          onClose={() => {
            if (savingManage) return;
            setOpenManage(false);
          }}
          title={selectedTurma ? `Alunos de ${selectedTurma.name}` : "Alunos da turma"}
          footer={
            <>
              <button
                onClick={() => setOpenManage(false)}
                className="px-3 py-2 border rounded disabled:opacity-50"
                disabled={savingManage}
              >
                Fechar
              </button>
            </>
          }
        >
          {!selectedTurma ? (
            <div className="p-2">Selecione uma turma.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-sm mb-1">Adicionar aluno</label>
                  <select
                    value={addStudentId}
                    onChange={(e) => setAddStudentId(e.target.value)}
                    className="border rounded px-3 py-2 w-full"
                  >
                    <option value="">— selecione —</option>
                    {candidates.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button onClick={onAddMember} className="px-3 py-2 border rounded">
                  Adicionar
                </button>
              </div>

              <div className="border rounded">
                {members.length === 0 ? (
                  <div className="p-3">Nenhum aluno nesta turma.</div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <Th>Aluno</Th>
                        <Th>Status</Th>
                        <Th>Ações</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((s) => (
                        <tr key={s.id} className="border-t">
                          <Td>{s.name}</Td>
                          <Td>{s.status}</Td>
                          <Td className="py-2">
                            <div className="flex gap-2">
                              <button
                                onClick={() => onRemoveMember(s.id)}
                                className="px-2 py-1 border rounded"
                              >
                                Remover
                              </button>
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </main>
  );
}

function Th({ children }) {
  return <th className="text-left px-3 py-2 font-medium">{children}</th>;
}
function Td({ children }) {
  return <td className="px-3 py-2">{children}</td>;
}

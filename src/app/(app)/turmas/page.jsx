"use client";

import { useEffect, useMemo, useState } from "react";
import { financeGateway } from "@/lib/financeGateway";
import Modal from "@/components/Modal";
import Link from "next/link";

export default function TurmasPage() {
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
      // ordem de preferência: função de contagem -> lista -> campo local
      if (typeof financeGateway.countStudentsInTurma === "function") {
        try {
          const n = await financeGateway.countStudentsInTurma(turmaId);
          return Number(n || 0);
        } catch {
          /* ignore */
        }
      }
      if (typeof financeGateway.listTurmaMembers === "function") {
        try {
          const m = await financeGateway.listTurmaMembers(turmaId);
          return toArray(m).length;
        } catch {
          /* ignore */
        }
      }
      if (Array.isArray(t?.student_ids)) return t.student_ids.length;
      if (typeof t?.students_count === "number") return t.students_count;
      return 0;
    }

    const enriched = await Promise.all(
      toArray(ts).map(async (t) => {
        const teacher_name =
          t.teacher_name ??
          teacherById[t.teacher_id]?.name ??
          "-";

        const students_count = await countMembers(t.id, t);

        return {
          ...t,
          teacher_name,
          students_count,
        };
      })
    );

    setTurmas(enriched);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openManageMembers(t) {
    setSelectedTurma(t);
    const m = await financeGateway.listTurmaMembers(t.id);
    setMembers(m);
    setAddStudentId("");
    setOpenManage(true);
  }

  function openCreateTurma() {
    setEditingId(null);
    setFormTurma({ name: "", teacher_id: "", capacity: 20 });
    setOpenEditTurma(true);
  }
  function openEditTurmaModal(t) {
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

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Turmas</h1>
        <button onClick={openCreateTurma} className="border rounded px-3 py-2">
          + Criar turma
        </button>
      </div>

      <section className="border rounded overflow-auto">
        {loading ? (
          <div className="p-4">Carregando…</div>
        ) : turmas.length === 0 ? (
          <div className="p-4">Nenhuma turma criada.</div>
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
              {turmas.map((t) => (
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
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Modal CRIAR/EDITAR TURMA */}
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

      {/* Modal GERENCIAR ALUNOS DA TURMA */}
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
    </main>
  );
}

function Th({ children }) {
  return <th className="text-left px-3 py-2 font-medium">{children}</th>;
}
function Td({ children }) {
  return <td className="px-3 py-2">{children}</td>;
}

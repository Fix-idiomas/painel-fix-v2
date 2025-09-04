"use client";

import { useEffect, useState } from "react";
import { financeGateway } from "@/lib/financeGateway";
import Modal from "@/components/Modal";

export default function PagadoresPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  // ---- Modal: Cadastrar ----
  const [openCreate, setOpenCreate] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [formCreate, setFormCreate] = useState({ name: "", email: "" });

  // ---- Modal: Editar ----
  const [openEdit, setOpenEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formEdit, setFormEdit] = useState({ name: "", email: "" });

  async function load() {
    setLoading(true);
    const rows = await financeGateway.listPayers();
    setList(rows);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  // -------- Cadastrar ----------
  function resetCreate() {
    setFormCreate({ name: "", email: "" });
    setSavingCreate(false);
  }
  async function onSubmitCreate(e) {
    e?.preventDefault?.();
    try {
      setSavingCreate(true);
      if (!formCreate.name.trim()) throw new Error("Nome é obrigatório.");
      await financeGateway.createPayer({
        name: formCreate.name.trim(),
        email: formCreate.email.trim() || null,
      });
      resetCreate();
      setOpenCreate(false);
      await load();
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSavingCreate(false);
    }
  }

  // -------- Editar ----------
  function openEditModal(p) {
    setEditId(p.id);
    setFormEdit({ name: p.name || "", email: p.email || "" });
    setOpenEdit(true);
  }
  function closeEdit() {
    if (savingEdit) return;
    setOpenEdit(false);
    setEditId(null);
  }
  async function onSubmitEdit(e) {
    e?.preventDefault?.();
    if (!editId) return;
    try {
      setSavingEdit(true);
      if (!formEdit.name.trim()) throw new Error("Nome é obrigatório.");
      await financeGateway.updatePayer(editId, {
        name: formEdit.name.trim(),
        email: formEdit.email.trim() || null,
      });
      closeEdit();
      await load();
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSavingEdit(false);
    }
  }

  // -------- Ações de linha ----------
  async function onDelete(p) {
    if (!confirm(`Excluir pagador "${p.name}"?\n\nAtenção: não pode estar em uso por alunos/lançamentos.`)) {
      return;
    }
    try {
      await financeGateway.deletePayer(p.id);
      await load();
    } catch (err) {
      alert(err.message || String(err));
    }
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pagadores</h1>
        <button onClick={() => setOpenCreate(true)} className="border rounded px-3 py-2">
          + Cadastrar pagador
        </button>
      </div>

      <section className="border rounded overflow-auto">
        {loading ? (
          <div className="p-4">Carregando…</div>
        ) : list.length === 0 ? (
          <div className="p-4">Nenhum pagador cadastrado.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Nome</Th>
                <Th>E-mail</Th>
                <Th>Criado em</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-t">
                  <Td>{p.name}</Td>
                  <Td>{p.email || "-"}</Td>
                  <Td>{p.created_at ? new Date(p.created_at).toLocaleString("pt-BR") : "-"}</Td>
                  <Td className="py-2">
                    <div className="flex gap-2">
                      <button onClick={() => openEditModal(p)} className="px-2 py-1 border rounded">
                        Editar
                      </button>
                      <button onClick={() => onDelete(p)} className="px-2 py-1 border rounded">
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

      {/* Modal CADASTRAR */}
      <Modal
        open={openCreate}
        onClose={() => {
          if (savingCreate) return;
          setOpenCreate(false);
          resetCreate();
        }}
        title="Cadastrar pagador"
        footer={
          <>
            <button
              onClick={() => {
                if (savingCreate) return;
                setOpenCreate(false);
                resetCreate();
              }}
              className="px-3 py-2 border rounded disabled:opacity-50"
              disabled={savingCreate}
            >
              Cancelar
            </button>
            <button
              onClick={onSubmitCreate}
              className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50"
              disabled={savingCreate}
            >
              {savingCreate ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <form onSubmit={onSubmitCreate} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Nome*</label>
            <input
              value={formCreate.name}
              onChange={(e) => setFormCreate((f) => ({ ...f, name: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">E-mail</label>
            <input
              type="email"
              value={formCreate.email}
              onChange={(e) => setFormCreate((f) => ({ ...f, email: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              placeholder="opcional"
            />
          </div>
        </form>
      </Modal>

      {/* Modal EDITAR */}
      <Modal
        open={openEdit}
        onClose={closeEdit}
        title="Editar pagador"
        footer={
          <>
            <button onClick={closeEdit} className="px-3 py-2 border rounded disabled:opacity-50" disabled={savingEdit}>
              Cancelar
            </button>
            <button
              onClick={onSubmitEdit}
              className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50"
              disabled={savingEdit}
            >
              {savingEdit ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >
        <form onSubmit={onSubmitEdit} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Nome*</label>
            <input
              value={formEdit.name}
              onChange={(e) => setFormEdit((f) => ({ ...f, name: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">E-mail</label>
            <input
              type="email"
              value={formEdit.email}
              onChange={(e) => setFormEdit((f) => ({ ...f, email: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              placeholder="opcional"
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


"use client";

import { useEffect, useState } from "react";
import { financeGateway } from "@/lib/financeGateway";

export default function PagadoresPage() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: "", email: "" });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const rows = await financeGateway.listPayers();
    setList(rows);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function onSubmit(e) {
    e.preventDefault();
    await financeGateway.createPayer({
      name: form.name.trim(),
      email: form.email.trim() || null,
    });
    setForm({ name: "", email: "" });
    await load();
  }

  async function onEdit(p) {
    const name = prompt("Nome do pagador", p.name) ?? p.name;
    const email = prompt("E-mail (opcional)", p.email || "") || null;
    await financeGateway.updatePayer(p.id, { name, email });
    await load();
  }

  async function onDelete(p) {
    if (!confirm(`Excluir pagador "${p.name}"?\n\nAtenção: não pode estar em uso.`)) return;
    try {
      await financeGateway.deletePayer(p.id);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Pagadores</h1>

      <form onSubmit={onSubmit} className="border rounded p-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-sm mb-1">Nome*</label>
          <input
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            className="border rounded px-3 py-2 w-full"
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1">E-mail</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
            className="border rounded px-3 py-2 w-full"
            placeholder="opcional"
          />
        </div>
        <div className="sm:self-end">
          <button className="border rounded px-4 py-2">Cadastrar</button>
        </div>
      </form>

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
                      <button onClick={() => onEdit(p)} className="px-2 py-1 border rounded">Editar</button>
                      <button onClick={() => onDelete(p)} className="px-2 py-1 border rounded">Excluir</button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function Th({ children }) { return <th className="text-left px-3 py-2 font-medium">{children}</th>; }
function Td({ children }) { return <td className="px-3 py-2">{children}</td>; }

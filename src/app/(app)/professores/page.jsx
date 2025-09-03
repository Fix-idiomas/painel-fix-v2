"use client";

import { useEffect, useState } from "react";
import { financeGateway } from "@/lib/financeGateway";

export default function ProfessoresPage() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", phone: "", status: "ativo" });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const rows = await financeGateway.listTeachers();
    setList(rows);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function onSubmit(e) {
    e.preventDefault();
    await financeGateway.createTeacher({
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      status: form.status, // "ativo" | "inativo"
    });
    setForm({ name: "", email: "", phone: "", status: "ativo" });
    await load();
  }

  async function onEdit(t) {
    const name  = prompt("Nome", t.name) ?? t.name;
    const email = prompt("E-mail (opcional)", t.email || "") || null;
    const phone = prompt("Telefone (opcional)", t.phone || "") || null;
    const status = prompt('Status ("ativo" ou "inativo")', t.status) ?? t.status;
    await financeGateway.updateTeacher(t.id, { name, email, phone, status });
    await load();
  }

  async function onToggleStatus(t) {
    const next = t.status === "ativo" ? "inativo" : "ativo";
    await financeGateway.setTeacherStatus(t.id, next);
    await load();
  }

  async function onDelete(t) {
    if (!confirm(`Excluir professor "${t.name}"?`)) return;
    await financeGateway.deleteTeacher(t.id);
    await load();
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Professores</h1>

      <form onSubmit={onSubmit} className="border rounded p-4 grid gap-3 sm:grid-cols-5">
        <div className="sm:col-span-2">
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
        <div>
          <label className="block text-sm mb-1">Telefone</label>
          <input
            value={form.phone}
            onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
            className="border rounded px-3 py-2 w-full"
            placeholder="opcional"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Status</label>
          <select
            value={form.status}
            onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
            className="border rounded px-3 py-2 w-full"
          >
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </div>
        <div className="sm:col-span-4">
          <button className="border rounded px-4 py-2">Cadastrar</button>
        </div>
      </form>

      <section className="border rounded overflow-auto">
        {loading ? (
          <div className="p-4">Carregando…</div>
        ) : list.length === 0 ? (
          <div className="p-4">Nenhum professor cadastrado.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Nome</Th>
                <Th>E-mail</Th>
                <Th>Telefone</Th>
                <Th>Status</Th>
                <Th>Criado em</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className="border-t">
                  <Td>{t.name}</Td>
                  <Td>{t.email || "-"}</Td>
                  <Td>{t.phone || "-"}</Td>
                  <Td>{t.status}</Td>
                  <Td>{t.created_at ? new Date(t.created_at).toLocaleString("pt-BR") : "-"}</Td>
                  <Td className="py-2">
                    <div className="flex gap-2">
                      <button onClick={() => onEdit(t)} className="px-2 py-1 border rounded">Editar</button>
                      <button onClick={() => onToggleStatus(t)} className="px-2 py-1 border rounded">
                        {t.status === "ativo" ? "Inativar" : "Ativar"}
                      </button>
                      <button onClick={() => onDelete(t)} className="px-2 py-1 border rounded">Excluir</button>
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

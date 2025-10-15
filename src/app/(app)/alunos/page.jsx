"use client";

import { useEffect, useMemo, useState } from "react";
import { financeGateway, ADAPTER_NAME } from "@/lib/financeGateway";
import Modal from "@/components/Modal";
import Link from "next/link";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// evita bug de timezone ao exibir datas puras (YYYY-MM-DD)
const fmtYmdBR = (s) => {
  if (!s) return "-";
  const [y, m, d] = String(s).split("-");
  if (!y || !m || !d) return "-";
  return `${d}/${m}/${y}`;
};

const PAYER_MODE = { SELF: "self", EXISTING: "existing", NEW: "new" };

export default function AlunosPage() {
  const [list, setList] = useState([]);
  const [payers, setPayers] = useState([]);
  const [loading, setLoading] = useState(true);

  // 🔎 Busca
  const [query, setQuery] = useState("");

  // --------- Modal CADASTRAR ----------
  const [openCreate, setOpenCreate] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [formCreate, setFormCreate] = useState({
    name: "",
    monthly_value: "",
    due_day: "5",
    birth_date: "",
    email: "",
    endereco: "",
    cpf: "",
  });
  const [payerMode, setPayerMode] = useState(PAYER_MODE.SELF);
  const [payerId, setPayerId] = useState("");
  const [newPayer, setNewPayer] = useState({ name: "", email: "" });

  // --------- Modal EDITAR ----------
  const [openEdit, setOpenEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);     // confirm modal (edição)
  const [pendingChanges, setPendingChanges] = useState(null); // payload aguardando confirmação
  const [editId, setEditId] = useState(null);
  const [formEdit, setFormEdit] = useState({
    name: "",
    monthly_value: "",
    due_day: "5",
    birth_date: "",
    email: "",
    endereco: "",
    cpf: "",
  });

  // pagador no EDIT
  const [payerModeEdit, setPayerModeEdit] = useState(PAYER_MODE.SELF);
  const [payerIdEdit, setPayerIdEdit] = useState("");
  const [newPayerEdit, setNewPayerEdit] = useState({ name: "", email: "" });

  async function load() {
    setLoading(true);
    const [students, py] = await Promise.all([
      financeGateway.listStudents(),
      financeGateway.listPayers?.() ?? [],
    ]);
    setList(students);
    setPayers(py);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  // 🔎 Lista filtrada (nome ou CPF)
  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return list;

    const onlyDigitsQ = q.replace(/\D/g, "");
    return (list || []).filter((s) => {
      const name = String(s?.name || "").toLowerCase();
      const cpfDigits = String(s?.cpf || "").replace(/\D/g, "");
      const matchName = name.includes(q);
      const matchCpf = onlyDigitsQ ? cpfDigits.includes(onlyDigitsQ) : false;
      return matchName || matchCpf;
    });
  }, [list, query]);

  // ---------- Create ----------
  function resetCreate() {
    setFormCreate({ name: "", monthly_value: "", due_day: "5", birth_date: "" });
    setPayerMode(PAYER_MODE.SELF);
    setPayerId("");
    setNewPayer({ name: "", email: "" });
    setSavingCreate(false);
  }

  async function onSubmitCreate(e) {
    e?.preventDefault?.();
    try {
      setSavingCreate(true);

      let chosenPayerId = null;
      if (payerMode === PAYER_MODE.EXISTING) {
        if (!payerId) throw new Error("Selecione um pagador existente.");
        chosenPayerId = payerId;
      } else if (payerMode === PAYER_MODE.NEW) {
        if (!newPayer.name.trim()) throw new Error("Informe o nome do novo pagador.");
        const py = await financeGateway.createPayer({
          name: newPayer.name.trim(),
          email: newPayer.email.trim() || null,
        });
        chosenPayerId = py.id;
      } // SELF: deixa null, o back cria quando necessário

      await financeGateway.createStudent({
        name: formCreate.name.trim(),
        monthly_value: Number(formCreate.monthly_value || 0),
        due_day: Math.min(Math.max(Number(formCreate.due_day || 5), 1), 28),
        birth_date: formCreate.birth_date || null, // yyyy-mm-dd
        payer_id: chosenPayerId,
        email: formCreate.email || null,
        endereco: formCreate.endereco || null,
        cpf: formCreate.cpf || null,
      });

      resetCreate();
      setOpenCreate(false);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSavingCreate(false);
    }
  }

  // ---------- Edit ----------
  function openEditModal(s) {
    setEditId(s?.id || null);
    setFormEdit({
      name: s?.name ?? "",
      monthly_value: String(s?.monthly_value ?? ""),
      due_day: String(s?.due_day ?? ""),
      birth_date: s?.birth_date || "",
      email: s?.email ?? "",
      endereco: s?.endereco ?? "",
      cpf: s?.cpf ?? "",
    });
    // inicializa pagador no modo correto
    if (s?.payer_id) {
      setPayerModeEdit(PAYER_MODE.EXISTING);
      setPayerIdEdit(s.payer_id);
    } else {
      setPayerModeEdit(PAYER_MODE.SELF);
      setPayerIdEdit("");
    }
    setNewPayerEdit({ name: "", email: "" });

    // limpa estado do modal de confirmação
    setConfirmOpen(false);
    setPendingChanges(null);

    setOpenEdit(true);
  }

  async function onSubmitEdit(e) {
    e?.preventDefault?.();
    if (!editId) return;
    try {
      setSavingEdit(true);

      // calcula due_day sanitizado
      const newDueDay = Math.min(Math.max(Number(formEdit.due_day || 5), 1), 28);

      // resolve pagador conforme seleção no EDIT
      let chosenPayerId = null;
      if (payerModeEdit === PAYER_MODE.EXISTING) {
        chosenPayerId = payerIdEdit || null;
      } else if (payerModeEdit === PAYER_MODE.NEW) {
        if (!newPayerEdit.name.trim()) throw new Error("Informe o nome do novo pagador.");
        const py = await financeGateway.createPayer({
          name: newPayerEdit.name.trim(),
          email: newPayerEdit.email.trim() || null,
        });
        chosenPayerId = py.id;
      } else {
        chosenPayerId = null; // SELF
      }

      const changes = {
        name: formEdit.name.trim(),
        monthly_value: Number(formEdit.monthly_value || 0),
        due_day: newDueDay,
        birth_date: formEdit.birth_date || null,
        email: formEdit.email || null,
        endereco: formEdit.endereco || null,
        cpf: formEdit.cpf || null,
        payer_id: chosenPayerId,
      };

      // lê due_day atual no DB para comparar
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: curr, error: currErr } = await supabase
        .from("students")
        .select("due_day")
        .eq("id", editId)
        .single();

      // se mudou, abre o modal de confirmação e interrompe o salvar
      if (!currErr) {
        const oldDueDay = curr?.due_day ?? null;
        if (oldDueDay != null && Number(oldDueDay) !== changes.due_day) {
          setPendingChanges(changes);
          setConfirmOpen(true);
          setSavingEdit(false);
          return;
        }
      }

      // se não mudou (ou não conseguiu ler), salva normalmente
      await financeGateway.updateStudent(editId, changes);
      setOpenEdit(false);
      setEditId(null);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSavingEdit(false);
    }
  }

  function closeEdit() {
    if (savingEdit) return;
    setOpenEdit(false);
    setEditId(null);
  }

  function cancelConfirmDueDay() {
    setConfirmOpen(false);
    setPendingChanges(null);
  }

  async function confirmSaveEdit() {
    if (!pendingChanges || !editId) return;
    try {
      setSavingEdit(true);
      await financeGateway.updateStudent(editId, pendingChanges);
      setConfirmOpen(false);
      setPendingChanges(null);
      setOpenEdit(false);
      setEditId(null);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSavingEdit(false);
    }
  }

  // ---------- Ações de linha ----------
  async function onToggleStatus(s) {
    const next = s.status === "ativo" ? "inativo" : "ativo";
    await financeGateway.setStudentStatus(s.id, next);
    await load();
  }
  async function onDelete(s) {
    if (
      !confirm(
        `Excluir aluno "${s.name}"?\n\n` +
          "- Lançamentos NÃO pagos serão removidos.\n" +
          "- Lançamentos pagos (recebidos) serão mantidos para contabilidade."
      )
    )
      return;
    await financeGateway.deleteStudent(s.id);
    await load();
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          Adapter: <b>{ADAPTER_NAME}</b>
        </div>

        {/* 🔎 Campo de busca */}
        <div className="flex items-center gap-2 ml-auto">
          <input
            type="text"
            placeholder="Buscar por nome ou CPF…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border rounded px-3 py-2 w-72"
          />
          <button onClick={() => setQuery("")} className="border rounded px-3 py-2">
            Limpar
          </button>
          <button onClick={() => setOpenCreate(true)} className="border rounded px-3 py-2">
            + Cadastrar aluno
          </button>
        </div>
      </div>

      {/* Tabela */}
      <section className="border rounded overflow-auto">
        {loading ? (
          <div className="p-4">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            {query ? "Nenhum aluno encontrado para a busca." : "Nenhum aluno cadastrado."}
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Nome</Th>
                <Th>Mensalidade</Th>
                <Th>Venc.</Th>
                <Th>Nascimento</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t">
                  <Td>{s.name}</Td>
                  <Td>{fmtBRL(s.monthly_value)}</Td>
                  <Td>{s.due_day}</Td>
                  <Td>{s.birth_date ? fmtYmdBR(s.birth_date) : "-"}</Td>
                  <Td>{s.status}</Td>
                  <Td className="py-2">
                    <div className="flex gap-2">
                      <button onClick={() => openEditModal(s)} className="px-2 py-1 border rounded">
                        Editar
                      </button>
                      <Link href={`/alunos/${s.id}/evolucao`} className="px-2 py-1 border rounded">
                        Evolução
                      </Link>
                      <button onClick={() => onToggleStatus(s)} className="px-2 py-1 border rounded">
                        {s.status === "ativo" ? "Inativar" : "Ativar"}
                      </button>
                      <button onClick={() => onDelete(s)} className="px-2 py-1 border rounded">
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
        title="Cadastrar aluno"
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
          <div>
            <label className="block text-sm mb-1">Mensalidade (R$)*</label>
            <input
              type="number" min="0" step="0.01"
              value={formCreate.monthly_value}
              onChange={(e) => setFormCreate((f) => ({ ...f, monthly_value: e.target.value }))}
              className="border rounded px-3 py-2 w-full" required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Vencimento (1–28)*</label>
            <input
              type="number" min="1" max="28"
              value={formCreate.due_day}
              onChange={(e) => setFormCreate((f) => ({ ...f, due_day: e.target.value }))}
              className="border rounded px-3 py-2 w-full" required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Data de nascimento (opcional)</label>
            <input
              type="date"
              value={formCreate.birth_date}
              onChange={(e) => setFormCreate((f) => ({ ...f, birth_date: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">E-mail</label>
            <input
              type="email"
              value={formCreate.email}
              onChange={e => setFormCreate(f => ({ ...f, email: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Endereço</label>
            <input
              value={formCreate.endereco}
              onChange={e => setFormCreate(f => ({ ...f, endereco: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">CPF</label>
            <input
              value={formCreate.cpf}
              onChange={e => setFormCreate(f => ({ ...f, cpf: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          {/* Pagador (cadastro) */}
          <div className="sm:col-span-2 mt-2">
            <div className="text-sm font-semibold mb-1">Pagador</div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio" name="payerMode"
                  checked={payerMode === PAYER_MODE.SELF}
                  onChange={() => setPayerMode(PAYER_MODE.SELF)}
                />
                <span>Próprio aluno</span>
              </label>

              <label className="inline-flex items-center gap-2">
                <input
                  type="radio" name="payerMode"
                  checked={payerMode === PAYER_MODE.EXISTING}
                  onChange={() => setPayerMode(PAYER_MODE.EXISTING)}
                />
                <span>Selecionar existente</span>
              </label>
              {payerMode === PAYER_MODE.EXISTING && (
                <select
                  value={payerId}
                  onChange={(e) => setPayerId(e.target.value)}
                  className="border rounded px-3 py-2 w-full"
                >
                  <option value="">— escolha um pagador —</option>
                  {payers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.email ? `— ${p.email}` : ""}
                    </option>
                  ))}
                </select>
              )}

              <label className="inline-flex items-center gap-2">
                <input
                  type="radio" name="payerMode"
                  checked={payerMode === PAYER_MODE.NEW}
                  onChange={() => setPayerMode(PAYER_MODE.NEW)}
                />
                <span>Criar novo pagador</span>
              </label>
              {payerMode === PAYER_MODE.NEW && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    placeholder="Nome do pagador*"
                    value={newPayer.name}
                    onChange={(e) => setNewPayer((n) => ({ ...n, name: e.target.value }))}
                    className="border rounded px-3 py-2 w-full" required
                  />
                  <input
                    placeholder="E-mail (opcional)" type="email"
                    value={newPayer.email}
                    onChange={(e) => setNewPayer((n) => ({ ...n, email: e.target.value }))}
                    className="border rounded px-3 py-2 w-full"
                  />
                </div>
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal EDITAR */}
      <Modal
        open={openEdit}
        onClose={closeEdit}
        title="Editar aluno"
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
              className="border rounded px-3 py-2 w-full" required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Mensalidade (R$)*</label>
            <input
              type="number" min="0" step="0.01"
              value={formEdit.monthly_value}
              onChange={(e) => setFormEdit((f) => ({ ...f, monthly_value: e.target.value }))}
              className="border rounded px-3 py-2 w-full" required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Vencimento (1–28)*</label>
            <input
              type="number" min="1" max="28"
              value={formEdit.due_day}
              onChange={(e) => setFormEdit((f) => ({ ...f, due_day: e.target.value }))}
              className="border rounded px-3 py-2 w-full" required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Data de nascimento (opcional)</label>
            <input
              type="date"
              value={formEdit.birth_date}
              onChange={(e) => setFormEdit((f) => ({ ...f, birth_date: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">E-mail</label>
            <input
              type="email"
              value={formEdit.email}
              onChange={e => setFormEdit(f => ({ ...f, email: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Endereço</label>
            <input
              value={formEdit.endereco}
              onChange={e => setFormEdit(f => ({ ...f, endereco: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">CPF</label>
            <input
              value={formEdit.cpf}
              onChange={e => setFormEdit(f => ({ ...f, cpf: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          {/* Pagador (edição) */}
          <div className="sm:col-span-2 mt-2">
            <div className="text-sm font-semibold mb-1">Pagador</div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio" name="payerModeEdit"
                  checked={payerModeEdit === PAYER_MODE.SELF}
                  onChange={() => setPayerModeEdit(PAYER_MODE.SELF)}
                />
                <span>Próprio aluno</span>
              </label>

              <label className="inline-flex items-center gap-2">
                <input
                  type="radio" name="payerModeEdit"
                  checked={payerModeEdit === PAYER_MODE.EXISTING}
                  onChange={() => setPayerModeEdit(PAYER_MODE.EXISTING)}
                />
                <span>Selecionar existente</span>
              </label>
              {payerModeEdit === PAYER_MODE.EXISTING && (
                <select
                  value={payerIdEdit}
                  onChange={(e) => setPayerIdEdit(e.target.value)}
                  className="border rounded px-3 py-2 w-full"
                >
                  <option value="">— escolha um pagador —</option>
                  {payers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.email ? `— ${p.email}` : ""}
                    </option>
                  ))}
                </select>
              )}

              <label className="inline-flex items-center gap-2">
                <input
                  type="radio" name="payerModeEdit"
                  checked={payerModeEdit === PAYER_MODE.NEW}
                  onChange={() => setPayerModeEdit(PAYER_MODE.NEW)}
                />
                <span>Criar novo pagador</span>
              </label>
              {payerModeEdit === PAYER_MODE.NEW && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    placeholder="Nome do pagador*"
                    value={newPayerEdit.name}
                    onChange={(e) => setNewPayerEdit((n) => ({ ...n, name: e.target.value }))}
                    className="border rounded px-3 py-2 w-full" required
                  />
                  <input
                    placeholder="E-mail (opcional)" type="email"
                    value={newPayerEdit.email}
                    onChange={(e) => setNewPayerEdit((n) => ({ ...n, email: e.target.value }))}
                    className="border rounded px-3 py-2 w-full"
                  />
                </div>
              )}
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal de confirmação (edição) */}
      <Modal
        open={confirmOpen}
        onClose={cancelConfirmDueDay}
        title="Confirmar alteração do dia de vencimento"
        footer={
          <>
            <button
              onClick={cancelConfirmDueDay}
              className="px-3 py-2 border rounded"
              disabled={savingEdit}
            >
              Cancelar
            </button>
            <button
              onClick={confirmSaveEdit}
              className="px-3 py-2 border rounded bg-emerald-600 text-white disabled:opacity-50"
              disabled={savingEdit}
            >
              Confirmar
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Esta mudança vale <b>apenas para cobranças futuras</b>. As mensalidades
          <b> já geradas não serão atualizadas automaticamente</b>.
        </p>
      </Modal>
    </main>
  );
}

function Th({ children }) { return <th className="text-left px-3 py-2 font-medium">{children}</th>; }
function Td({ children }) { return <td className="px-3 py-2">{children}</td>; }

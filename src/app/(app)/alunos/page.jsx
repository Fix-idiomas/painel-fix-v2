"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { financeGateway } from "@/lib/financeGateway";
import { supabase } from "@/lib/supabaseClient";
import AvatarAluno from "@/components/AvatarAluno";
import Modal from "@/components/Modal";
import Link from "next/link";

const fmtBRL = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtYmdBR = (s) => {
  if (!s) return "-";
  const [y, m, d] = String(s).split("-");
  if (!y || !m || !d) return "-";
  return `${d}/${m}/${y}`;
};

const PAYER_MODE = { SELF: "self", EXISTING: "existing", NEW: "new" };

export default function AlunosPage() {
  const router = useRouter();
  const [list, setList] = useState([]);
  const [payers, setPayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("cards");
  const [query, setQuery] = useState("");

  // Create modal
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

  // Edit modal
  const [openEdit, setOpenEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(null);
  const [editId, setEditId] = useState(null);
  const [formEdit, setFormEdit] = useState({
    name: "",
    monthly_value: "",
    due_day: "5",
    birth_date: "",
    email: "",
    endereco: "",
    cpf: "",
    photo_url: "",
  });
  const [photoFileEdit, setPhotoFileEdit] = useState(null);
  const [photoPreviewEdit, setPhotoPreviewEdit] = useState("");
  const [photoPreviewIsObject, setPhotoPreviewIsObject] = useState(false);
  const [editPhotoPath, setEditPhotoPath] = useState("");
  const [payerModeEdit, setPayerModeEdit] = useState(PAYER_MODE.SELF);
  const [payerIdEdit, setPayerIdEdit] = useState("");
  const [newPayerEdit, setNewPayerEdit] = useState({ name: "", email: "" });

  const [actionFor, setActionFor] = useState(null);
  const [signedMap, setSignedMap] = useState({});
  const [tenantId, setTenantId] = useState(null);
  // Removido auto-detector de fotos (tentativas silenciosas de .webp/.jpg)

  async function getSignedUrl(path, opts = {}) {
    const key = String(path || "").trim();
    const silent = !!opts.silent;
    if (!key) return null;
    if (signedMap[key]) return signedMap[key];
    try {
      const { data, error } = await supabase.storage.from("student-photos").createSignedUrl(key, 600);
      if (error) {
        if (!silent) console.warn("[students] createSignedUrl falhou:", error.message || String(error), "path=", key);
        return null;
      }
      const url = data?.signedUrl || null;
      if (url) setSignedMap((m) => ({ ...m, [key]: url }));
      return url;
    } catch (e) {
      if (!silent) console.warn("[students] erro inesperado ao criar signed URL:", e?.message || String(e), "path=", key);
      return null;
    }
  }

  async function load() {
    setLoading(true);
    // Descobre tenant_id uma vez (para fallback de fotos)
    if (!tenantId) {
      try {
        const { data: tId } = await supabase.rpc("current_tenant_id");
        if (tId) setTenantId(tId);
      } catch {}
    }
    const [students, py] = await Promise.all([
      financeGateway.listStudents(),
      financeGateway.listPayers?.() ?? [],
    ]);
    setList(students);
    setPayers(py);
    // Prefetch assíncrono de fotos conhecidas
    try {
      const pending = (students || [])
        .map((s) => String(s.photo_url || "").trim())
        .filter(Boolean)
        .filter((p) => !signedMap[p])
        .slice(0, 100);
      if (pending.length) {
        await Promise.all(pending.map((p) => getSignedUrl(p, { silent: true })));
      }
    } catch (e) {
      console.warn("[students] prefetch fotos falhou:", e?.message || String(e));
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    const onlyDigitsQ = q.replace(/\D/g, "");
    return list.filter((s) => {
      const name = (s.name || "").toLowerCase();
      const cpfDigits = (s.cpf || "").replace(/\D/g, "");
      return name.includes(q) || (onlyDigitsQ && cpfDigits.includes(onlyDigitsQ));
    });
  }, [list, query]);

  useEffect(() => {
    const pending = filtered
      .map((s) => String(s.photo_url || "").trim())
      .filter(Boolean)
      .filter((p) => !signedMap[p])
      .slice(0, 50);
    if (pending.length) Promise.all(pending.map((p) => getSignedUrl(p, { silent: true })));
  }, [filtered]);

  // Auto-detector removido: agora somente exibe fotos já persistidas em photo_url

  function resetCreate() {
    setFormCreate({ name: "", monthly_value: "", due_day: "5", birth_date: "", email: "", endereco: "", cpf: "" });
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
        const py = await financeGateway.createPayer({ name: newPayer.name.trim(), email: newPayer.email.trim() || null });
        chosenPayerId = py.id;
      }
      await financeGateway.createStudent({
        name: formCreate.name.trim(),
        monthly_value: Number(formCreate.monthly_value || 0),
        due_day: Math.min(Math.max(Number(formCreate.due_day || 5), 1), 28),
        birth_date: formCreate.birth_date || null,
        payer_id: chosenPayerId,
        email: formCreate.email || null,
        endereco: formCreate.endereco || null,
        cpf: formCreate.cpf || null,
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

  function openEditModal(s) {
    setEditId(s.id);
    setFormEdit({
      name: s.name || "",
      monthly_value: String(s.monthly_value || ""),
      due_day: String(s.due_day || ""),
      birth_date: s.birth_date || "",
      email: s.email || "",
      endereco: s.endereco || "",
      cpf: s.cpf || "",
    });
    if (photoPreviewEdit && photoPreviewIsObject) URL.revokeObjectURL(photoPreviewEdit);
    setPhotoFileEdit(null);
    setPhotoPreviewEdit("");
    setPhotoPreviewIsObject(false);
    const currPath = String(s.photo_url || "").trim();
    setEditPhotoPath(currPath);
    if (currPath) {
      if (!signedMap[currPath]) getSignedUrl(currPath, { silent: true });
    }
    if (s.payer_id) {
      setPayerModeEdit(PAYER_MODE.EXISTING);
      setPayerIdEdit(s.payer_id);
    } else {
      setPayerModeEdit(PAYER_MODE.SELF);
      setPayerIdEdit("");
    }
    setNewPayerEdit({ name: "", email: "" });
    setConfirmOpen(false);
    setPendingChanges(null);
    setOpenEdit(true);
  }

  async function performSaveEdit(changes) {
    if (!editId) return;
    await financeGateway.updateStudent(editId, changes);
    if (photoFileEdit) {
      try {
        const { data: tId, error: tErr } = await supabase.rpc("current_tenant_id");
        if (tErr || !tId) throw new Error("tenant_id indisponível para salvar a foto");
        const ext = photoFileEdit.type?.includes("webp") ? "webp" : "jpg";
        const path = `tenant/${tId}/students/${editId}.${ext}`;
        const up = await supabase.storage.from("student-photos").upload(path, photoFileEdit, {
          upsert: true,
          contentType: photoFileEdit.type || "image/jpeg",
        });
        if (up.error) throw up.error;
        const signed = await getSignedUrl(path, { silent: true });
        if (!signed) throw new Error("Falha ao validar imagem enviada (signed URL ausente)");
        await financeGateway.updateStudent(editId, { photo_url: path });
      } catch (err) {
        console.warn("Upload de foto falhou:", err.message || String(err));
        alert(`Falha ao enviar a foto: ${err.message || err}`);
      }
    }
    setOpenEdit(false);
    setEditId(null);
    await load();
  }

  async function onSubmitEdit(e) {
    e?.preventDefault?.();
    if (!editId) return;
    try {
      setSavingEdit(true);
      const newDueDay = Math.min(Math.max(Number(formEdit.due_day || 5), 1), 28);
      let chosenPayerId = null;
      if (payerModeEdit === PAYER_MODE.EXISTING) {
        chosenPayerId = payerIdEdit || null;
      } else if (payerModeEdit === PAYER_MODE.NEW) {
        if (!newPayerEdit.name.trim()) throw new Error("Informe o nome do novo pagador.");
        const py = await financeGateway.createPayer({ name: newPayerEdit.name.trim(), email: newPayerEdit.email.trim() || null });
        chosenPayerId = py.id;
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
      const { data: curr, error: currErr } = await supabase.from("students").select("due_day").eq("id", editId).single();
      if (!currErr) {
        const oldDueDay = curr?.due_day ?? null;
        if (oldDueDay != null && Number(oldDueDay) !== changes.due_day) {
          setPendingChanges(changes);
          setConfirmOpen(true);
          setSavingEdit(false);
          return;
        }
      }
      await performSaveEdit(changes);
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSavingEdit(false);
    }
  }

  function closeEdit() {
    if (savingEdit) return;
    setOpenEdit(false);
    setEditId(null);
    if (photoPreviewEdit && photoPreviewIsObject) URL.revokeObjectURL(photoPreviewEdit);
    setPhotoFileEdit(null);
    setPhotoPreviewEdit("");
    setPhotoPreviewIsObject(false);
    setEditPhotoPath("");
  }

  function cancelConfirmDueDay() {
    setConfirmOpen(false);
    setPendingChanges(null);
  }

  async function confirmSaveEdit() {
    if (!pendingChanges || !editId) return;
    try {
      setSavingEdit(true);
      await performSaveEdit(pendingChanges);
      setConfirmOpen(false);
      setPendingChanges(null);
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSavingEdit(false);
    }
  }

  async function onToggleStatus(s) {
    const next = s.status === "ativo" ? "inativo" : "ativo";
    await financeGateway.setStudentStatus(s.id, next);
    await load();
  }
  async function onDelete(s) {
    if (!confirm(`Excluir aluno "${s.name}"?\n\n- Lançamentos NÃO pagos serão removidos.\n- Lançamentos pagos (recebidos) serão mantidos para contabilidade.`)) return;
    await financeGateway.deleteStudent(s.id);
    await load();
  }

  return (
    <main className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 ml-auto w-full sm:w-auto">
          <input
            type="text"
            placeholder="Buscar por nome ou CPF…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm w-full sm:w-80"
          />
          <button onClick={() => setQuery("")} className="border rounded px-2 py-1.5 text-xs sm:text-sm">Limpar</button>
          <button onClick={() => setOpenCreate(true)} className="rounded px-2 py-1.5 text-xs sm:text-sm bg-black text-white">+ Cadastrar aluno</button>
        </div>
        <div className="w-full sm:w-auto flex items-center gap-1 sm:gap-2">
          <div className="inline-flex border rounded overflow-hidden text-xs">
            <button type="button" className={`px-2 py-1 ${viewMode === "cards" ? "bg-slate-900 text-white" : "bg-white"}`} onClick={() => setViewMode("cards")}>Cards</button>
            <button type="button" className={`px-2 py-1 ${viewMode === "table" ? "bg-slate-900 text-white" : "bg-white"}`} onClick={() => setViewMode("table")}>Tabela</button>
          </div>
        </div>
      </div>
      <section>
        {loading ? (
          <div className="p-4">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4">{query ? "Nenhum aluno encontrado para a busca." : "Nenhum aluno cadastrado."}</div>
        ) : viewMode === "cards" ? (
          <div className="grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((s) => (
              <div key={s.id} className="rounded border bg-white p-3">
                <div className="flex items-center gap-3">
                  <AvatarAluno student={s} size="md" imageUrl={s.photo_url ? signedMap[String(s.photo_url).trim()] : undefined} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="mt-0.5 text-xs text-slate-600 flex items-center gap-3">
                      <span>Mens.: {fmtBRL(s.monthly_value)}</span>
                      <span>Venc.: {s.due_day}</span>
                      <span>Nasc.: {s.birth_date ? fmtYmdBR(s.birth_date) : "-"}</span>
                    </div>
                  </div>
                  <span className={s.status === "ativo" ? "inline-block rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs" : "inline-block rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs"}>{s.status}</span>
                </div>
                <div className="mt-2 flex justify-end">
                  <button className="px-2 py-1.5 text-xs border rounded" onClick={() => setActionFor(s)} aria-label={`Ações para ${s.name}`}>Ações</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border rounded-xl overflow-auto shadow-sm">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="sticky top-0 z-10 bg-gradient-to-br from-[var(--fix-primary-700)] via-[var(--fix-primary-600)] to-[var(--fix-primary)] text-white/95">
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
                {filtered.map((s, idx) => (
                  <tr key={s.id} className={`border-t hover:bg-slate-50 ${idx % 2 ? "bg-slate-50/50" : "bg-white"}`}>
                    <Td>
                      <div className="flex items-center gap-2 min-w-0">
                        <AvatarAluno student={s} size="sm" imageUrl={s.photo_url ? signedMap[String(s.photo_url).trim()] : undefined} />
                        <span className="truncate">{s.name}</span>
                      </div>
                    </Td>
                    <Td>{fmtBRL(s.monthly_value)}</Td>
                    <Td>{s.due_day}</Td>
                    <Td>{s.birth_date ? fmtYmdBR(s.birth_date) : "-"}</Td>
                    <Td>
                      <span className={s.status === "ativo" ? "inline-block rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs" : "inline-block rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-xs"}>{s.status}</span>
                    </Td>
                    <Td className="py-2">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEditModal(s)} className="px-2 py-1.5 text-xs border rounded hover:bg-slate-50">Editar</button>
                        <Link href={`/alunos/${s.id}/evolucao`} className="px-2 py-1.5 text-xs border rounded hover:bg-slate-50">Evolução</Link>
                        <button onClick={() => onToggleStatus(s)} className="px-2 py-1.5 text-xs border rounded hover:bg-slate-50">{s.status === "ativo" ? "Inativar" : "Ativar"}</button>
                        <button onClick={() => onDelete(s)} className="px-2 py-1.5 text-xs border rounded border-rose-200 text-rose-700 hover:bg-rose-50">Excluir</button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        footer={(
          <>
            <button onClick={() => { if (savingCreate) return; setOpenCreate(false); resetCreate(); }} className="px-3 py-2 border rounded disabled:opacity-50" disabled={savingCreate}>Cancelar</button>
            <button onClick={onSubmitCreate} className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50" disabled={savingCreate}>{savingCreate ? "Salvando…" : "Salvar"}</button>
          </>
        )}
      >
        <form onSubmit={onSubmitCreate} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Nome*</label>
            <input value={formCreate.name} onChange={(e) => setFormCreate((f) => ({ ...f, name: e.target.value }))} className="border rounded px-3 py-2 w-full" required />
          </div>
          <div>
            <label className="block text-sm mb-1">Mensalidade (R$)*</label>
            <input type="number" min="0" step="0.01" value={formCreate.monthly_value} onChange={(e) => setFormCreate((f) => ({ ...f, monthly_value: e.target.value }))} className="border rounded px-3 py-2 w-full" required />
          </div>
          <div>
            <label className="block text-sm mb-1">Vencimento (1–28)*</label>
            <input type="number" min="1" max="28" value={formCreate.due_day} onChange={(e) => setFormCreate((f) => ({ ...f, due_day: e.target.value }))} className="border rounded px-3 py-2 w-full" required />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Data de nascimento (opcional)</label>
            <input type="date" value={formCreate.birth_date} onChange={(e) => setFormCreate((f) => ({ ...f, birth_date: e.target.value }))} className="border rounded px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm mb-1">E-mail</label>
            <input type="email" value={formCreate.email} onChange={(e) => setFormCreate((f) => ({ ...f, email: e.target.value }))} className="border rounded px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm mb-1">Endereço</label>
            <input value={formCreate.endereco} onChange={(e) => setFormCreate((f) => ({ ...f, endereco: e.target.value }))} className="border rounded px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm mb-1">CPF</label>
            <input value={formCreate.cpf} onChange={(e) => setFormCreate((f) => ({ ...f, cpf: e.target.value }))} className="border rounded px-3 py-2 w-full" />
          </div>
          <div className="sm:col-span-2 mt-2">
            <div className="text-sm font-semibold mb-1">Pagador</div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="payerMode" checked={payerMode === PAYER_MODE.SELF} onChange={() => setPayerMode(PAYER_MODE.SELF)} />
                <span>Próprio aluno</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="payerMode" checked={payerMode === PAYER_MODE.EXISTING} onChange={() => setPayerMode(PAYER_MODE.EXISTING)} />
                <span>Selecionar existente</span>
              </label>
              {payerMode === PAYER_MODE.EXISTING && (
                <select value={payerId} onChange={(e) => setPayerId(e.target.value)} className="border rounded px-3 py-2 w-full">
                  <option value="">— escolha um pagador —</option>
                  {payers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} {p.email ? `— ${p.email}` : ""}</option>
                  ))}
                </select>
              )}
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="payerMode" checked={payerMode === PAYER_MODE.NEW} onChange={() => setPayerMode(PAYER_MODE.NEW)} />
                <span>Criar novo pagador</span>
              </label>
              {payerMode === PAYER_MODE.NEW && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input placeholder="Nome do pagador*" value={newPayer.name} onChange={(e) => setNewPayer((n) => ({ ...n, name: e.target.value }))} className="border rounded px-3 py-2 w-full" required />
                  <input placeholder="E-mail (opcional)" type="email" value={newPayer.email} onChange={(e) => setNewPayer((n) => ({ ...n, email: e.target.value }))} className="border rounded px-3 py-2 w-full" />
                </div>
              )}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={openEdit}
        onClose={closeEdit}
        title="Editar aluno"
        footer={(
          <>
            <button onClick={closeEdit} className="px-3 py-2 border rounded disabled:opacity-50" disabled={savingEdit}>Cancelar</button>
            <button onClick={onSubmitEdit} className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50" disabled={savingEdit}>{savingEdit ? "Salvando…" : "Salvar"}</button>
          </>
        )}
      >
        <form onSubmit={onSubmitEdit} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Nome*</label>
            <input value={formEdit.name} onChange={(e) => setFormEdit((f) => ({ ...f, name: e.target.value }))} className="border rounded px-3 py-2 w-full" required />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Foto do aluno (opcional)</label>
            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <AvatarAluno
                  student={{ id: editId, name: formEdit.name }}
                  imageUrl={photoPreviewEdit || (editPhotoPath ? signedMap[editPhotoPath] : undefined)}
                  size="md"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <input
                    id="fileEdit"
                    type="file"
                    accept="image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      if (!f) {
                        if (photoPreviewEdit && photoPreviewIsObject) URL.revokeObjectURL(photoPreviewEdit);
                        setPhotoFileEdit(null);
                        setPhotoPreviewEdit("");
                        setPhotoPreviewIsObject(false);
                        return;
                      }
                      if (f.size > 1024 * 1024) {
                        alert("Imagem muito grande (máx. 1 MB).");
                        e.target.value = "";
                        return;
                      }
                      if (photoPreviewEdit && photoPreviewIsObject) URL.revokeObjectURL(photoPreviewEdit);
                      const url = URL.createObjectURL(f);
                      setPhotoFileEdit(f);
                      setPhotoPreviewEdit(url);
                      setPhotoPreviewIsObject(true);
                    }}
                  />
                  <label
                    htmlFor="fileEdit"
                    className="px-3 py-2 text-sm border rounded bg-white hover:bg-slate-50 cursor-pointer"
                  >Escolher arquivo</label>
                  <span className="text-xs text-slate-600 truncate max-w-[260px]">
                    {photoFileEdit ? photoFileEdit.name : "Nenhum arquivo escolhido"}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">JPEG/WebP até 1 MB. Ideal quadrada (1:1).</div>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm mb-1">Mensalidade (R$)*</label>
            <input type="number" min="0" step="0.01" value={formEdit.monthly_value} onChange={(e) => setFormEdit((f) => ({ ...f, monthly_value: e.target.value }))} className="border rounded px-3 py-2 w-full" required />
          </div>
          <div>
            <label className="block text-sm mb-1">Vencimento (1–28)*</label>
            <input type="number" min="1" max="28" value={formEdit.due_day} onChange={(e) => setFormEdit((f) => ({ ...f, due_day: e.target.value }))} className="border rounded px-3 py-2 w-full" required />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Data de nascimento (opcional)</label>
            <input type="date" value={formEdit.birth_date} onChange={(e) => setFormEdit((f) => ({ ...f, birth_date: e.target.value }))} className="border rounded px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm mb-1">E-mail</label>
            <input type="email" value={formEdit.email} onChange={(e) => setFormEdit((f) => ({ ...f, email: e.target.value }))} className="border rounded px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm mb-1">Endereço</label>
            <input value={formEdit.endereco} onChange={(e) => setFormEdit((f) => ({ ...f, endereco: e.target.value }))} className="border rounded px-3 py-2 w-full" />
          </div>
          <div>
            <label className="block text-sm mb-1">CPF</label>
            <input value={formEdit.cpf} onChange={(e) => setFormEdit((f) => ({ ...f, cpf: e.target.value }))} className="border rounded px-3 py-2 w-full" />
          </div>
          <div className="sm:col-span-2 mt-2">
            <div className="text-sm font-semibold mb-1">Pagador</div>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="payerModeEdit" checked={payerModeEdit === PAYER_MODE.SELF} onChange={() => setPayerModeEdit(PAYER_MODE.SELF)} />
                <span>Próprio aluno</span>
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="payerModeEdit" checked={payerModeEdit === PAYER_MODE.EXISTING} onChange={() => setPayerModeEdit(PAYER_MODE.EXISTING)} />
                <span>Selecionar existente</span>
              </label>
              {payerModeEdit === PAYER_MODE.EXISTING && (
                <select value={payerIdEdit} onChange={(e) => setPayerIdEdit(e.target.value)} className="border rounded px-3 py-2 w-full">
                  <option value="">— escolha um pagador —</option>
                  {payers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} {p.email ? `— ${p.email}` : ""}</option>
                  ))}
                </select>
              )}
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="payerModeEdit" checked={payerModeEdit === PAYER_MODE.NEW} onChange={() => setPayerModeEdit(PAYER_MODE.NEW)} />
                <span>Criar novo pagador</span>
              </label>
              {payerModeEdit === PAYER_MODE.NEW && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input placeholder="Nome do pagador*" value={newPayerEdit.name} onChange={(e) => setNewPayerEdit((n) => ({ ...n, name: e.target.value }))} className="border rounded px-3 py-2 w-full" required />
                  <input placeholder="E-mail (opcional)" type="email" value={newPayerEdit.email} onChange={(e) => setNewPayerEdit((n) => ({ ...n, email: e.target.value }))} className="border rounded px-3 py-2 w-full" />
                </div>
              )}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!actionFor}
        onClose={() => setActionFor(null)}
        title={actionFor ? `Ações — ${actionFor.name}` : "Ações"}
        footer={<button className="px-3 py-2 border rounded" onClick={() => setActionFor(null)}>Fechar</button>}
      >
        {actionFor && (
          <div className="grid gap-2">
            <button className="w-full px-3 py-2 border rounded hover:bg-slate-50 text-left" onClick={() => { setActionFor(null); openEditModal(actionFor); }}>Editar</button>
            <button className="w-full px-3 py-2 border rounded hover:bg-slate-50 text-left" onClick={() => { setActionFor(null); router.push(`/alunos/${actionFor.id}/evolucao`); }}>Evolução</button>
            <button className="w-full px-3 py-2 border rounded hover:bg-slate-50 text-left" onClick={async () => { setActionFor(null); await onToggleStatus(actionFor); }}>{actionFor.status === "ativo" ? "Inativar" : "Ativar"}</button>
            <button className="w-full px-3 py-2 border rounded border-rose-200 text-rose-700 hover:bg-rose-50 text-left" onClick={async () => { setActionFor(null); await onDelete(actionFor); }}>Excluir</button>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={cancelConfirmDueDay}
        title="Confirmar alteração do dia de vencimento"
        footer={(
          <>
            <button onClick={cancelConfirmDueDay} className="px-3 py-2 border rounded" disabled={savingEdit}>Cancelar</button>
            <button onClick={confirmSaveEdit} className="px-3 py-2 border rounded bg-emerald-600 text-white disabled:opacity-50" disabled={savingEdit}>Confirmar</button>
          </>
        )}
      >
        <p className="text-sm text-slate-700">Esta mudança vale <b>apenas para cobranças futuras</b>. As mensalidades <b>já geradas não serão atualizadas automaticamente</b>.</p>
      </Modal>
    </main>
  );
}

function Th({ children }) { return <th className="text-left px-3 py-2 font-medium">{children}</th>; }
function Td({ children }) { return <td className="px-3 py-2">{children}</td>; }

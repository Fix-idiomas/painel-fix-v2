"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/contexts/SessionContext";
import { financeGateway } from "@/lib/financeGateway";
import Modal from "@/components/Modal";

const fmtWhen = (s) => (s ? new Date(s).toLocaleString("pt-BR") : "-");

export default function CategoriasPage() {
  const sess = useSession();
  const ready = sess?.ready ?? true;

  const [permChecked, setPermChecked] = useState(false);
  const [canReadDB, setCanReadDB] = useState(false);
  const [canWriteDB, setCanWriteDB] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      try {
        const { supabase } = await import("@/lib/supabaseClient");
        const { data: tenantId, error: tErr } = await supabase.rpc("current_tenant_id");
        if (tErr) throw tErr;
        const [rRead, rWrite] = await Promise.all([
          supabase.rpc("is_admin_or_finance_read", { p_tenant: tenantId }),
          supabase.rpc("is_admin_or_finance_write", { p_tenant: tenantId }),
        ]);
        if (!alive) return;
        if (rRead.error) throw rRead.error;
        if (rWrite.error) throw rWrite.error;
        setCanReadDB(!!rRead.data);
        setCanWriteDB(!!rWrite.data);
      } catch (e) {
        console.warn("perm check (categorias) failed:", e);
        setCanReadDB(false);
        setCanWriteDB(false);
      } finally {
        if (alive) setPermChecked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready, sess?.user?.id]);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [openEdit, setOpenEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catId, setCatId] = useState(null);
  const [form, setForm] = useState({ name: "", active: true });

  const fallbackMode = useMemo(() => rows.length && rows[0]?.id == null, [rows]);

  async function load() {
    setLoading(true);
    try {
      const list = await financeGateway.listExpenseCategories();
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      console.warn("listExpenseCategories error:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!permChecked || !canReadDB) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permChecked, canReadDB]);

  if (!permChecked) return <main className="p-6">Carregando…</main>;
  if (!canReadDB) return (
    <main className="p-6">
      <h1 className="text-xl font-semibold mb-2">Acesso negado</h1>
      <p className="text-sm opacity-75">Você não tem permissão para visualizar o Financeiro desta escola.</p>
    </main>
  );

  function openCreate() {
    if (!canWriteDB) { alert("Sem permissão para criar."); return; }
    setCatId(null);
    setForm({ name: "", active: true });
    setOpenEdit(true);
  }
  function openEditCat(c) {
    if (!canWriteDB) { alert("Sem permissão para editar."); return; }
    setCatId(c.id);
    setForm({ name: c.name || "", active: !!c.active });
    setOpenEdit(true);
  }

  async function onSubmit(e) {
    e?.preventDefault?.();
    if (!canWriteDB) return;
    try {
      setSaving(true);
      if (catId) {
        await financeGateway.updateExpenseCategory(catId, { name: form.name, active: form.active });
      } else {
        await financeGateway.createExpenseCategory({ name: form.name, active: form.active });
      }
      setOpenEdit(false);
      await load();
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id) {
    if (!canWriteDB) return;
    if (!confirm("Excluir categoria?")) return;
    try {
      await financeGateway.deleteExpenseCategory(id);
      await load();
    } catch (err) {
      alert(err?.message || String(err));
    }
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Categorias de Despesas</h1>
        <div className="flex items-center gap-2">
          {fallbackMode && (
            <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 border border-amber-300">modo leitura (tabela ausente)</span>
          )}
          {canWriteDB && <button onClick={openCreate} className="rounded-lg border px-3 py-2 bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300">+ Nova categoria</button>}
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden shadow-sm">
        <div className="px-3 py-2 border-b border-[color:var(--fix-primary-700)] bg-gradient-to-br from-[var(--fix-primary-700)] via-[var(--fix-primary-600)] to-[var(--fix-primary)] text-white/95 font-semibold drop-shadow-sm">Categorias</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white/90 border-b">
              <tr>
                <Th>Nome</Th>
                <Th style={{width:120}}>Status</Th>
                <Th style={{width:200}}>Atualizado</Th>
                <Th style={{width:180}}>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><Td colSpan={4}>Carregando…</Td></tr>
              ) : rows.length === 0 ? (
                <tr><Td colSpan={4}>Nenhuma categoria.</Td></tr>
              ) : rows.map((c) => (
                <tr key={`${c.id ?? c.name}`} className="border-t odd:bg-slate-50/40 hover:bg-slate-50">
                  <Td>{c.name}</Td>
                  <Td>{c.active ? "ativa" : "inativa"}</Td>
                  <Td>{fmtWhen(c.updated_at || c.created_at)}</Td>
                  <Td>
                    {canWriteDB && c.id && (
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => openEditCat(c)} className="rounded border px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200">Editar</button>
                        <button onClick={() => onDelete(c.id)} className="rounded border px-2 py-1 text-sm bg-red-50 text-red-700 border-red-200 hover:bg-red-100">Excluir</button>
                      </div>
                    )}
                    {(!c.id || !canWriteDB) && <span className="text-xs text-slate-500">(somente leitura)</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-sm text-slate-600">
        Dica: Depois de criar/editar categorias, elas aparecem como opções nos formulários de Gastos (avulso e recorrentes). Você também pode continuar digitando um nome livre, se preferir.
      </div>

      {openEdit && (
        <Modal
          open={openEdit}
          onClose={() => setOpenEdit(false)}
          title={catId ? "Editar categoria" : "Nova categoria"}
          footer={
            <>
              <button onClick={() => setOpenEdit(false)} className="px-3 py-2 border rounded">Cancelar</button>
              <button onClick={onSubmit} disabled={saving} className="px-3 py-2 border rounded bg-gray-700 text-white disabled:opacity-50">{saving ? "Salvando…" : "Salvar"}</button>
            </>
          }
        >
          <form onSubmit={onSubmit} className="grid gap-3">
            <div>
              <label className="block text-sm mb-1">Nome*</label>
              <input value={form.name} onChange={(e)=>setForm((f)=>({...f,name:e.target.value}))} className="border rounded px-3 py-2 w-full" required />
            </div>
            <div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e)=>setForm((f)=>({...f,active:e.target.checked}))} />
                Ativa
              </label>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}

function Th({ children, className = "", style }) {
  return <th className={`text-left px-3 py-2 font-medium ${className}`} style={style}>{children}</th>;
}
function Td({ children, colSpan, className = "", style }) {
  return <td className={`px-3 py-2 ${className}`} style={style} colSpan={colSpan}>{children}</td>;
}

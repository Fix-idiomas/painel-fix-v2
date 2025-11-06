"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/contexts/SessionContext";
import { financeGateway } from "@/lib/financeGateway";
import Modal from "@/components/Modal";
import Link from "next/link";


// Tradução de status
const statusLabels = {
  pending: "Pendente",
  paid: "Pago",
  canceled: "Cancelado",
};

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBR = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : "-");

export default function GastosPage() {
  // ---------- Sessão (somente para reagir a troca de usuário) ----------
  const sess = useSession();
  const ready = sess?.ready ?? true; // se não houver "ready" no contexto, segue true

  // ---------- Permissões via DB (fonte da verdade) ----------
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
        console.warn("perm check (gastos) failed:", e);
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

  // ---------- Estado ----------
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7));
  const [status, setStatus] = useState("all"); // all | pending | paid | canceled
  const [costCenter, setCostCenter] = useState("all"); // all | PJ | PF
  const [updatingId, setUpdatingId] = useState(null);

  const [rows, setRows] = useState([]);
  const [kpis, setKpis] = useState({ total: 0, paid: 0, pending: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);

  // Recorrentes
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [openEditTpl, setOpenEditTpl] = useState(false);
  const [savingTpl, setSavingTpl] = useState(false);
  const [tplId, setTplId] = useState(null);
  const [formTpl, setFormTpl] = useState({
    title: "",
    category: "",
    amount: "",
    frequency: "monthly", // monthly | annual
    due_day: "5",
    due_month: "1",
    active: true,
    cost_center: "PJ", // PJ | PF
    // Novos (recorrência)
    recurrence_mode: "indefinite", // 'indefinite' | 'installments' | 'until_month'
    start_month: "", // YYYY-MM
    installments: "",
    end_month: "", // YYYY-MM
  });

  // ---------- Duplicatas (helpers locais) ----------
  const normalizeTitle = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const clampDay = (n) => Math.min(Math.max(Number(n || 5), 1), 28);
  const shapeKey = (freq, day, month, cc) =>
    `${cc || "PJ"}|${String(freq || "monthly")}|${clampDay(day)}|${String(freq) === "annual" ? Number(month || 0) : 0}`;

  const currentShapeKey = useMemo(
    () => shapeKey(formTpl.frequency, formTpl.due_day, formTpl.due_month, formTpl.cost_center),
    [formTpl.frequency, formTpl.due_day, formTpl.due_month, formTpl.cost_center]
  );

  const exactDuplicate = useMemo(() => {
    if (!formTpl.title) return null;
    const norm = normalizeTitle(formTpl.title);
    const amt = Number(formTpl.amount || 0);
    return (
      templates.find(
        (t) =>
          (!tplId || t.id !== tplId) &&
          !!t.active &&
          shapeKey(t.frequency, t.due_day, t.due_month, t.cost_center) === currentShapeKey &&
          normalizeTitle(t.title) === norm &&
          Math.abs(Number(t.amount || 0) - amt) < 0.01
      ) || null
    );
  }, [templates, formTpl.title, formTpl.amount, currentShapeKey, tplId]);

  // Similaridade simples por tokens (soft suggestion)
  const tokenSet = (s) => new Set(normalizeTitle(s).split(" ").filter(Boolean));
  const tokenJaccard = (a, b) => {
    const A = tokenSet(a);
    const B = tokenSet(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const w of A) if (B.has(w)) inter++;
    return inter / (A.size + B.size - inter);
  };

  const softSuggestions = useMemo(() => {
    if (!formTpl.title) return [];
    const norm = normalizeTitle(formTpl.title);
    const augmented = (templates || [])
      .filter((t) => !(tplId && t.id === tplId))
      .map((t) => {
        const tNorm = normalizeTitle(t.title);
        const starts = tNorm.startsWith(norm) ? 1 : 0;
        const includes = !starts && tNorm.includes(norm) ? 1 : 0;
        const sim = tokenJaccard(tNorm, norm);
        // Prioriza prefixo, depois substring, depois similaridade
        const score = starts * 3 + includes * 2 + sim;
        return { t, tNorm, score, starts, includes, sim };
      })
      .filter((r) => r.starts || r.includes || r.sim >= 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((r) => r.t);
    return augmented;
  }, [templates, formTpl.title, tplId]);

  // Avulso
  const [openAvulso, setOpenAvulso] = useState(false);
  const [savingAvulso, setSavingAvulso] = useState(false);
  const [formAvulso, setFormAvulso] = useState({
    date: "",
    title: "",
    category: "",
    amount: "",
    cost_center: "PJ", // PJ | PF
  });

  // ---------- Carregar dados do mês (somente com READ do banco) ----------
  async function load() {
    setLoading(true);
    const { rows, kpis } = await financeGateway.listExpenseEntries({
      ym,
      status: status === "all" ? null : status,
      cost_center: costCenter === "all" ? null : costCenter,
    });
    setRows(rows);
    setKpis(kpis);
    setLoading(false);
  }

  useEffect(() => {
    if (!permChecked || !canReadDB) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permChecked, canReadDB, ym, status, costCenter]);

  // ---------- Recorrentes (somente com WRITE do banco) ----------
  async function loadTemplates() {
    const list = await financeGateway.listExpenseTemplates();
    setTemplates(list);
  }

  useEffect(() => {
    if (!permChecked || !canWriteDB) return;
    loadTemplates();
  }, [permChecked, canWriteDB, ym]);

  // Carregar categorias (read suficiente)
  useEffect(() => {
    if (!permChecked || !canReadDB) return;
    (async () => {
      try {
        const list = await financeGateway.listExpenseCategories();
        setCategories(Array.isArray(list) ? list : []);
      } catch {
        setCategories([]);
      }
    })();
  }, [permChecked, canReadDB]);

  // Se perder permissão de write, limpa UI
  useEffect(() => {
    if (!canWriteDB) {
      setTemplates([]);
      setOpenEditTpl(false);
      setOpenAvulso(false);
    }
  }, [canWriteDB]);

  // ---------- Gates ----------
  if (!permChecked) {
    return <main className="p-6">Carregando…</main>;
  }
  if (!canReadDB) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold mb-2">Acesso negado</h1>
        <p className="text-sm opacity-75">
          Você não tem permissão para visualizar o Financeiro desta escola.
        </p>
      </main>
    );
  }

  // ---------- Ações do mês ----------
  async function onPreview() {
    if (!canWriteDB) {
      alert("Você não tem permissão para gerar despesas.");
      return;
    }
    const prev = await financeGateway.previewGenerateExpenses({ ym });
    if (!prev.length) {
      alert("Nada a gerar para este mês.");
      return;
    }
    const txt =
      "Prévia de geração:\n\n" +
      prev
        .map((p) => `• ${p.title_snapshot} — ${fmtBRL(p.amount)} (venc. ${fmtBR(p.due_date)})`)
        .join("\n") +
      "\n\nDeseja GERAR esses lançamentos?";
    if (confirm(txt)) {
      await financeGateway.generateExpenses({ ym });
      await load();
    }
  }

  // ---------- Ações por item ----------
  const markPaid = async (id) => {
    if (!canWriteDB) {
      alert("Você não tem permissão para marcar como pago.");
      return;
    }
    try {
      setUpdatingId(id);
      if (financeGateway.updateExpenseEntry) {
        await financeGateway.updateExpenseEntry(id, {
          status: "paid",
          paid_at: new Date().toISOString(),
        });
      } else {
        const { supabase } = await import("@/lib/supabaseClient");
        const { error } = await supabase
          .from("expense_entries")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
      }
      await load();
    } finally {
      setUpdatingId(null);
    }
  };

  const reopen = async (id) => {
    if (!canWriteDB) {
      alert("Você não tem permissão para reabrir.");
      return;
    }
    try {
      setUpdatingId(id);
      if (financeGateway.updateExpenseEntry) {
        await financeGateway.updateExpenseEntry(id, { status: "pending", paid_at: null });
      } else {
        const { supabase } = await import("@/lib/supabaseClient");
        const { error } = await supabase
          .from("expense_entries")
          .update({ status: "pending", paid_at: null })
          .eq("id", id);
        if (error) throw error;
      }
      await load();
    } finally {
      setUpdatingId(null);
    }
  };

  const cancel = async (id) => {
    if (!canWriteDB) {
      alert("Você não tem permissão para cancelar.");
      return;
    }
    try {
      setUpdatingId(id);
      const note = prompt("Motivo do cancelamento (opcional):") || "";
      if (financeGateway.updateExpenseEntry) {
        await financeGateway.updateExpenseEntry(id, { status: "canceled", paid_at: null });
      } else {
        const { supabase } = await import("@/lib/supabaseClient");
        const { error } = await supabase
          .from("expense_entries")
          .update({ status: "canceled", paid_at: null /*, cancel_reason: note */ })
          .eq("id", id);
        if (error) throw error;
      }
      await load();
    } finally {
      setUpdatingId(null);
    }
  };

  const delEntry = async (id) => {
    if (!canWriteDB) {
      alert("Você não tem permissão para excluir lançamentos.");
      return;
    }
    if (!confirm("Excluir lançamento?")) return;
    await financeGateway.deleteExpenseEntry
      ? financeGateway.deleteExpenseEntry(id)
      : (await import("@/lib/supabaseClient")).supabase.from("expense_entries").delete().eq("id", id);
    await load();
  };

  // ---------- Templates (CRUD somente com canWriteDB) ----------
  function openCreateTpl() {
    if (!canWriteDB) {
      alert("Você não tem permissão para criar recorrentes.");
      return;
    }
    setTplId(null);
    setFormTpl({
      title: "",
      category: "",
      amount: "",
      frequency: "monthly",
      due_day: "5",
      due_month: "1",
      active: true,
      cost_center: "PJ",
      recurrence_mode: "indefinite",
      start_month: "",
      installments: "",
      end_month: "",
    });
    setOpenEditTpl(true);
  }

  function openEditTplModal(t) {
    if (!canWriteDB) {
      alert("Você não tem permissão para editar recorrentes.");
      return;
    }
    setTplId(t.id);
    setFormTpl({
      title: t.title || "",
      category: t.category || "",
      amount: String(t.amount ?? ""),
      frequency: t.frequency || "monthly",
      due_day: String(t.due_day ?? "5"),
      due_month: String(t.due_month ?? "1"),
      active: !!t.active,
      cost_center: t.cost_center || "PJ",
      recurrence_mode: t.recurrence_mode || "indefinite",
      start_month: (t.start_month ? String(t.start_month).slice(0,7) : ""),
      installments: t.installments != null ? String(t.installments) : "",
      end_month: (t.end_month ? String(t.end_month).slice(0,7) : ""),
    });
    setOpenEditTpl(true);
  }

  async function onSubmitTpl(e) {
    e?.preventDefault?.();
    if (!canWriteDB) {
      alert("Você não tem permissão para salvar recorrentes.");
      return;
    }
    try {
      setSavingTpl(true);
      // Bloqueio de duplicata exata (no cliente)
      if (!tplId && exactDuplicate) {
        throw new Error(
          `Já existe uma recorrente idêntica: "${exactDuplicate.title}" (${fmtBRL(exactDuplicate.amount)}). ` +
            `Ajuste o título/valor ou edite a existente.`
        );
      }
      const payload = {
        title: formTpl.title.trim(),
        category: formTpl.category.trim() || null,
        amount: Number(formTpl.amount || 0),
        frequency: formTpl.frequency,
        due_day: Number(formTpl.due_day || 5),
        due_month: Number(formTpl.due_month || 1),
        active: !!formTpl.active,
        cost_center: formTpl.cost_center,
        // Novos (recorrência)
        recurrence_mode: formTpl.recurrence_mode,
        start_month: formTpl.start_month ? `${formTpl.start_month}-01` : null,
        installments: formTpl.recurrence_mode === 'installments' ? Number(formTpl.installments || 0) : null,
        end_month: formTpl.recurrence_mode === 'until_month' && formTpl.end_month ? `${formTpl.end_month}-01` : null,
      };
      if (!payload.title) throw new Error("Título é obrigatório");
      // Validações de recorrência no front (para mensagens melhores)
      if (payload.recurrence_mode === 'installments') {
        if (!payload.installments || payload.installments < 1) {
          throw new Error("Informe o número de parcelas (>= 1)");
        }
      }
      if (payload.recurrence_mode === 'until_month') {
        if (!payload.end_month) throw new Error("Informe o mês final");
        if (payload.start_month && payload.end_month < payload.start_month) {
          throw new Error("Mês final deve ser maior ou igual ao mês inicial");
        }
      }

      if (tplId) await financeGateway.updateExpenseTemplate(tplId, payload);
      else await financeGateway.createExpenseTemplate(payload);

      setOpenEditTpl(false);
      await loadTemplates();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSavingTpl(false);
    }
  }

  async function onDeleteTpl(t) {
    if (!canWriteDB) {
      alert("Você não tem permissão para excluir recorrentes.");
      return;
    }
    if (!confirm(`Excluir recorrente "${t.title}"?`)) return;
    await financeGateway.deleteExpenseTemplate(t.id);
    await loadTemplates();
  }

  function openAvulsoModal() {
    if (!canWriteDB) {
      alert("Você não tem permissão para criar lançamentos avulsos.");
      return;
    }
    setFormAvulso({
      date: "",
      title: "",
      category: "",
      amount: "",
      cost_center: "PJ",
    });
    setOpenAvulso(true);
  }

  async function onSubmitAvulso(e) {
    e?.preventDefault?.();
    if (!canWriteDB) {
      alert("Você não tem permissão para salvar lançamentos avulsos.");
      return;
    }
    try {
      setSavingAvulso(true);
      const payload = {
        // O gateway espera 'date' e faz o mapeamento para 'due_date'
        date: formAvulso.date,
        title: formAvulso.title.trim(),
        category: formAvulso.category.trim() || null,
        amount: Number(formAvulso.amount || 0),
        cost_center: formAvulso.cost_center,
      };
      if (!payload.date) throw new Error("Data é obrigatória");
      if (!payload.title) throw new Error("Título é obrigatório");
      await financeGateway.createOneOffExpense(payload);
      setOpenAvulso(false);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setSavingAvulso(false);
    }
  }

  // ---------- Render ----------
  return (
    <main className="p-6 space-y-8">
      {/* Header / Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Gastos</h1>

        <input
          type="month"
          value={ym}
          onChange={(e) => setYm(e.target.value.slice(0, 7))}
          className="border rounded px-2 py-1"
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="all">Todos</option>
          <option value="pending">Pendentes</option>
          <option value="paid">Pagos</option>
          <option value="canceled">Cancelados</option>
        </select>

        <select
          value={costCenter}
          onChange={(e) => setCostCenter(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="all">Todos os centros</option>
          <option value="PJ">PJ (Empresa)</option>
          <option value="PF">PF (Pessoal)</option>
        </select>

        {canWriteDB && (
          <>
            <button onClick={onPreview} className="border rounded px-3 py-2">
              Prévia / Gerar
            </button>
            <button onClick={openAvulsoModal} className="border rounded px-3 py-2">
              + Avulso
            </button>
          </>
        )}
      </div>

      {/* KPIs */}
      <section className="grid sm:grid-cols-4 gap-3">
        <KpiCard title="Total do mês" value={fmtBRL(kpis.total)} />
        <KpiCard title="Pagos" value={fmtBRL(kpis.paid)} />
        <KpiCard title="Pendentes" value={fmtBRL(kpis.pending)} />
        <KpiCard title="Em atraso" value={fmtBRL(kpis.overdue)} />
      </section>

      {/* Lançamentos do mês */}
      <section className="border rounded overflow-auto">
        <div className="p-3 border-b font-semibold">Lançamentos do mês</div>
        {loading ? (
          <div className="p-4">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="p-4">Sem lançamentos para este filtro.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Vencimento</Th>
                <Th>Título</Th>
                <Th>Categoria</Th>
                <Th>Centro</Th>
                <Th>Valor</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <Td>{fmtBR(r.due_date)}</Td>
                  <Td>{r.title_snapshot}</Td>
                  <Td>{r.category || "-"}</Td>
                  <Td>{r.cost_center || "-"}</Td>
                  <Td>{fmtBRL(r.amount)}</Td>
                  <Td>{statusLabels[r.status] || r.status}</Td>
                  <Td className="py-2">
                    {canWriteDB ? (
                      <div className="flex gap-2">
                        {r.status === "pending" ? (
                          <>
                            <button
                              onClick={() => markPaid(r.id)}
                              className="px-2 py-1 border rounded"
                              disabled={updatingId === r.id}
                            >
                              Marcar pago
                            </button>
                            <button
                              onClick={() => cancel(r.id)}
                              className="px-2 py-1 border rounded"
                              disabled={updatingId === r.id}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => reopen(r.id)}
                            className="px-2 py-1 border rounded"
                            disabled={updatingId === r.id}
                          >
                            Reabrir
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recorrentes (somente se canWriteDB === true) */}
      {canWriteDB && (
        <section className="border rounded overflow-auto">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="font-semibold">Despesas recorrentes</div>
            <button onClick={openCreateTpl} className="border rounded px-3 py-2">
              + Nova recorrente
            </button>
          </div>
          {templates.length === 0 ? (
            <div className="p-4">Nenhuma recorrente cadastrada.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <Th>Título</Th>
                  <Th>Categoria</Th>
                  <Th>Centro</Th>
                  <Th>Frequência</Th>
                  <Th>Vencimento</Th>
                  <Th>Valor</Th>
                  <Th>Status</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-t">
                    <Td>{t.title}</Td>
                    <Td>{t.category || "-"}</Td>
                    <Td>{t.cost_center || "-"}</Td>
                    <Td>{t.frequency === "annual" ? "Anual" : "Mensal"}</Td>
                    <Td>
                      {t.frequency === "annual"
                        ? `Mês ${t.due_month} • Dia ${t.due_day}`
                        : `Dia ${t.due_day}`}
                    </Td>
                    <Td>{fmtBRL(t.amount)}</Td>
                    <Td>{t.active ? "ativo" : "inativo"}</Td>
                    <Td className="py-2">
                      <div className="flex gap-2">
                        <button onClick={() => openEditTplModal(t)} className="px-2 py-1 border rounded">
                          Editar
                        </button>
                        <button onClick={() => onDeleteTpl(t)} className="px-2 py-1 border rounded">
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
      )}

      {/* Modais */}
      {canWriteDB && (
        <Modal
          open={openEditTpl}
          onClose={() => setOpenEditTpl(false)}
          title={tplId ? "Editar recorrente" : "Nova recorrente"}
          footer={
            <>
              <button onClick={() => setOpenEditTpl(false)} className="px-3 py-2 border rounded">
                Cancelar
              </button>
              <button
                onClick={onSubmitTpl}
                disabled={savingTpl}
                className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50"
              >
                {savingTpl ? "Salvando…" : "Salvar"}
              </button>
            </>
          }
        >
          <form onSubmit={onSubmitTpl} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm mb-1">Título*</label>
              <input
                value={formTpl.title}
                onChange={(e) => setFormTpl((f) => ({ ...f, title: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
                required
              />
              {!!softSuggestions.length && (
                <div className="mt-2 text-xs p-2 border rounded bg-amber-50 border-amber-200">
                  <div className="font-medium mb-1">Possíveis duplicatas (não bloqueia):</div>
                  <ul className="list-disc pl-4 space-y-1">
                    {softSuggestions.map((t) => (
                      <li key={t.id}>
                        <span className="font-medium">{t.title}</span>
                        <span className="opacity-70"> — {fmtBRL(t.amount)}</span>
                        <span className="opacity-70"> · {t.frequency === 'annual' ? `Anual (mês ${t.due_month})` : `Mensal (dia ${t.due_day})`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm mb-1">Categoria</label>
                <Link href="/financeiro/categorias" className="text-xs text-slate-600 underline underline-offset-2">Gerenciar</Link>
              </div>
              {categories.length > 0 ? (
                <select
                  value={formTpl.category || ""}
                  onChange={(e) => setFormTpl((f) => ({ ...f, category: e.target.value }))}
                  className="border rounded px-3 py-2 w-full"
                >
                  <option value="">(sem categoria)</option>
                  {categories.map((c) => (
                    <option key={`${c.id ?? c.name}`} value={c.name}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={formTpl.category}
                  onChange={(e) => setFormTpl((f) => ({ ...f, category: e.target.value }))}
                  className="border rounded px-3 py-2 w-full"
                  placeholder="Digite a categoria"
                />
              )}
            </div>

            <div>
              <label className="block text-sm mb-1">Valor (R$)*</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formTpl.amount}
                onChange={(e) => setFormTpl((f) => ({ ...f, amount: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Centro de custos*</label>
              <select
                value={formTpl.cost_center}
                onChange={(e) => setFormTpl((f) => ({ ...f, cost_center: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
              >
                <option value="PJ">PJ</option>
                <option value="PF">PF</option>
              </select>
            </div>

            <div>
              <label className="block text-sm mb-1">Frequência*</label>
              <select
                value={formTpl.frequency}
                onChange={(e) => setFormTpl((f) => ({ ...f, frequency: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
              >
                <option value="monthly">Mensal</option>
                <option value="annual">Anual</option>
              </select>
            </div>

            {/* Recorrência: duração */}
            <div>
              <label className="block text-sm mb-1">Duração</label>
              <select
                value={formTpl.recurrence_mode}
                onChange={(e) => setFormTpl((f) => ({ ...f, recurrence_mode: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
              >
                <option value="indefinite">Indefinida</option>
                <option value="installments">Por parcelas</option>
                <option value="until_month">Até um mês</option>
              </select>
            </div>

            <div>
              <label className="block text-sm mb-1">Início (mês)</label>
              <input
                type="month"
                value={formTpl.start_month}
                onChange={(e) => setFormTpl((f) => ({ ...f, start_month: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
              />
            </div>

            {formTpl.frequency === "annual" ? (
              <>
                <div>
                  <label className="block text-sm mb-1">Mês</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={formTpl.due_month}
                    onChange={(e) => setFormTpl((f) => ({ ...f, due_month: e.target.value }))}
                    className="border rounded px-3 py-2 w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">Dia</label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    value={formTpl.due_day}
                    onChange={(e) => setFormTpl((f) => ({ ...f, due_day: e.target.value }))}
                    className="border rounded px-3 py-2 w-full"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm mb-1">Dia de vencimento</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={formTpl.due_day}
                  onChange={(e) => setFormTpl((f) => ({ ...f, due_day: e.target.value }))}
                  className="border rounded px-3 py-2 w-full"
                />
              </div>
            )}

            {formTpl.recurrence_mode === 'installments' && (
              <div>
                <label className="block text-sm mb-1">Parcelas</label>
                <input
                  type="number"
                  min="1"
                  value={formTpl.installments}
                  onChange={(e) => setFormTpl((f) => ({ ...f, installments: e.target.value }))}
                  className="border rounded px-3 py-2 w-full"
                />
              </div>
            )}

            {formTpl.recurrence_mode === 'until_month' && (
              <div>
                <label className="block text-sm mb-1">Até (mês)</label>
                <input
                  type="month"
                  value={formTpl.end_month}
                  onChange={(e) => setFormTpl((f) => ({ ...f, end_month: e.target.value }))}
                  className="border rounded px-3 py-2 w-full"
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formTpl.active}
                  onChange={(e) => setFormTpl((f) => ({ ...f, active: e.target.checked }))}
                />
                <span>Ativo</span>
              </label>
            </div>
          </form>
        </Modal>
      )}

      {canWriteDB && (
        <Modal
          open={openAvulso}
          onClose={() => setOpenAvulso(false)}
          title="Lançamento avulso"
          footer={
            <>
              <button onClick={() => setOpenAvulso(false)} className="px-3 py-2 border rounded">
                Cancelar
              </button>
              <button
                onClick={onSubmitAvulso}
                disabled={savingAvulso}
                className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50"
              >
                {savingAvulso ? "Salvando…" : "Salvar"}
              </button>
            </>
          }
        >
          <form onSubmit={onSubmitAvulso} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm mb-1">Data*</label>
              <input
                type="date"
                value={formAvulso.date}
                onChange={(e) => setFormAvulso((f) => ({ ...f, date: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-1">Valor (R$)*</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formAvulso.amount}
                onChange={(e) => setFormAvulso((f) => ({ ...f, amount: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm mb-1">Título*</label>
              <input
                value={formAvulso.title}
                onChange={(e) => setFormAvulso((f) => ({ ...f, title: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm mb-1">Categoria</label>
                <Link href="/financeiro/categorias" className="text-xs text-slate-600 underline underline-offset-2">Gerenciar</Link>
              </div>
              {categories.length > 0 ? (
                <select
                  value={formAvulso.category || ""}
                  onChange={(e) => setFormAvulso((f) => ({ ...f, category: e.target.value }))}
                  className="border rounded px-3 py-2 w-full"
                >
                  <option value="">(sem categoria)</option>
                  {categories.map((c) => (
                    <option key={`${c.id ?? c.name}`} value={c.name}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={formAvulso.category}
                  onChange={(e) => setFormAvulso((f) => ({ ...f, category: e.target.value }))}
                  className="border rounded px-3 py-2 w-full"
                  placeholder="Digite a categoria"
                />
              )}
            </div>

            <div>
              <label className="block text-sm mb-1">Centro de custos*</label>
              <select
                value={formAvulso.cost_center}
                onChange={(e) => setFormAvulso((f) => ({ ...f, cost_center: e.target.value }))}
                className="border rounded px-3 py-2 w-full"
              >
                <option value="PJ">PJ</option>
                <option value="PF">PF</option>
              </select>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}

function KpiCard({ title, value }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
function Th({ children }) {
  return <th className="text-left px-3 py-2 font-medium">{children}</th>;
}
function Td({ children }) {
  return <td className="px-3 py-2">{children}</td>;
}

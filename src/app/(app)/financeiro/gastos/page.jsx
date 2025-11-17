"use client";

import { useEffect, useMemo, useState, useRef } from "react";
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
  const [showAdvFilters, setShowAdvFilters] = useState(false); // toggle filtros avançados (mobile)

  const [rows, setRows] = useState([]);
  const [kpis, setKpis] = useState({ total: 0, paid: 0, pending: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);

  // Recorrentes
  const [templates, setTemplates] = useState([]);
  const [tplSearch, setTplSearch] = useState("");
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

  // Filtro dos recorrentes (busca por título, categoria e centro)
  const filteredTemplates = useMemo(() => {
    const q = normalizeTitle(tplSearch);
    if (!q) return templates;
    return (templates || []).filter((t) => {
      const hay = [t.title, t.category, t.cost_center].map((v) => normalizeTitle(v || ""));
      return hay.some((h) => h.includes(q));
    });
  }, [templates, tplSearch]);

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
      {/* Barra de filtros (sticky) */}
      <div className="sticky top-0 z-30 -mx-6 px-6 py-3 bg-white/95 backdrop-blur border-b flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-bold mr-2">Gastos</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-slate-600 mb-1">Mês</label>
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value.slice(0, 7))}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-slate-600 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendentes</option>
              <option value="paid">Pagos</option>
              <option value="canceled">Cancelados</option>
            </select>
          </div>
          {/* Centro só em desktop */}
          <div className="hidden sm:block">
            <label className="block text-[11px] uppercase tracking-wide text-slate-600 mb-1">Centro</label>
            <select
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="all">Todos os centros</option>
              <option value="PJ">PJ (Empresa)</option>
              <option value="PF">PF (Pessoal)</option>
            </select>
          </div>
          {/* Toggle filtros avançados mobile */}
          <button
            type="button"
            onClick={() => setShowAdvFilters((v) => !v)}
            className="sm:hidden inline-flex items-center gap-1 px-2 py-1 text-sm border rounded"
          >
            Filtros
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-4 h-4 transition-transform ${showAdvFilters ? 'rotate-180' : ''}`}>
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        {canWriteDB && (
          <div className="ml-auto flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              onClick={onPreview}
              title="Mostra a prévia e permite gerar os lançamentos recorrentes deste mês"
              className="border rounded px-3 py-2 text-sm hover:bg-slate-50"
            >
              Prévia e gerar recorrentes
            </button>
            <button onClick={openAvulsoModal} className="border rounded px-3 py-2 text-sm bg-slate-900 text-white hover:bg-black">
              + Avulso
            </button>
            <button onClick={openCreateTpl} className="border rounded px-3 py-2 text-sm bg-slate-900 text-white hover:bg-black">
              + Nova recorrente
            </button>
          </div>
        )}
        {showAdvFilters && (
          <div className="w-full sm:hidden mt-3">
            <label className="block text-[11px] uppercase tracking-wide text-slate-600 mb-1">Centro</label>
            <select
              value={costCenter}
              onChange={(e) => setCostCenter(e.target.value)}
              className="border rounded px-2 py-1 text-sm w-full"
            >
              <option value="all">Todos os centros</option>
              <option value="PJ">PJ (Empresa)</option>
              <option value="PF">PF (Pessoal)</option>
            </select>
          </div>
        )}
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Total do mês" value={fmtBRL(kpis.total)} tone="neutral" />
        <KpiCard title="Pagos" value={fmtBRL(kpis.paid)} tone="success" />
        <KpiCard title="Pendentes" value={fmtBRL(kpis.pending)} tone="warning" />
        <KpiCard title="Em atraso" value={fmtBRL(kpis.overdue)} tone="danger" />
      </section>

      {/* Lançamentos do mês */}
      <section className="border rounded-xl shadow-sm">
        <div className="px-3 py-2 border-b border-[color:var(--fix-primary-700)] bg-gradient-to-br from-[var(--fix-primary-700)] via-[var(--fix-primary-600)] to-[var(--fix-primary)] text-white/95 font-semibold drop-shadow-sm">Lançamentos do mês</div>
        {loading ? (
          <div className="p-4">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="p-4">Sem lançamentos para este filtro.</div>
        ) : (
          <div className="w-full">
            {/* Tabela (>= sm) */}
            <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-[900px] w-full text-xs sm:text-sm">
              <thead className="sticky top-0 z-10 bg-white/90 border-b">
                <tr>
                  <Th>Venc.</Th>
                  <Th>Título</Th>
                  <Th className="hidden sm:table-cell">Categoria</Th>
                  <Th className="hidden sm:table-cell">Centro</Th>
                  <Th className="text-right">Valor</Th>
                  <Th className="hidden sm:table-cell">Status</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t odd:bg-slate-50/40 hover:bg-slate-50">
                    <Td className="whitespace-nowrap">{fmtBR(r.due_date)}</Td>
                    <Td className="truncate max-w-[240px] sm:max-w-none">{r.title_snapshot}</Td>
                    <Td className="hidden sm:table-cell">{r.category || "-"}</Td>
                    <Td className="hidden sm:table-cell">{r.cost_center || "-"}</Td>
                    <Td className="text-right tabular-nums font-mono whitespace-nowrap">{fmtBRL(r.amount)}</Td>
                    <Td className="hidden sm:table-cell">{statusLabels[r.status] || r.status}</Td>
                    <Td className="py-2">
                      {canWriteDB ? (
                        <RowActions
                          entry={r}
                          updatingId={updatingId}
                          onPaid={(e) => markPaid(e.id)}
                          onCancel={(e) => cancel(e.id)}
                          onReopen={(e) => reopen(e.id)}
                          onDelete={(e) => delEntry(e.id)}
                        />
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Cards (xs) */}
            <div className="sm:hidden divide-y">
              {rows.map((r) => (
                <div key={r.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{r.title_snapshot}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="whitespace-nowrap">{fmtBR(r.due_date)}</span>
                        {r.category && <span className="truncate max-w-[160px]">{r.category}</span>}
                        {r.cost_center && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            {r.cost_center}
                          </span>
                        )}
                        <StatusPill status={r.status} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono tabular-nums font-semibold">{fmtBRL(r.amount)}</div>
                    </div>
                  </div>
                  <div className="mt-2">
                    {canWriteDB ? (
                      <RowActions
                        entry={r}
                        updatingId={updatingId}
                        onPaid={(e) => markPaid(e.id)}
                        onCancel={(e) => cancel(e.id)}
                        onReopen={(e) => reopen(e.id)}
                        onDelete={(e) => delEntry(e.id)}
                      />
                    ) : (
                      <span className="text-xs text-slate-500">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Recorrentes (somente se canWriteDB === true) */}
      {canWriteDB && (
        <section className="border rounded-xl shadow-sm">
          <div className="px-3 py-2 border-b border-[color:var(--fix-primary-700)] bg-gradient-to-br from-[var(--fix-primary-700)] via-[var(--fix-primary-600)] to-[var(--fix-primary)] text-white/95 drop-shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold whitespace-nowrap">Despesas recorrentes</span>
                  <span className="text-xs opacity-90">{filteredTemplates.length}{templates?.length ? ` / ${templates.length}` : ""}</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <input
                  value={tplSearch}
                  onChange={(e) => setTplSearch(e.target.value)}
                  placeholder="Buscar recorrentes (título, categoria, centro)"
                  className="w-full sm:w-80 px-3 py-1.5 rounded border border-white/30 bg-white/90 text-slate-900 placeholder-slate-500 focus:outline-none"
                  aria-label="Buscar recorrentes"
                />
              </div>
            </div>
          </div>
          {(templates?.length || 0) === 0 ? (
            <div className="p-4">Nenhuma recorrente cadastrada.</div>
          ) : (
            <div className="max-h-[60vh] w-full overflow-auto">
              {/* Tabela (>= sm) */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-[800px] w-full text-xs sm:text-sm">
                <thead className="sticky top-0 z-10 bg-white/90 border-b">
                  <tr>
                    <Th>Título</Th>
                    <Th className="hidden sm:table-cell">Categoria</Th>
                    <Th className="hidden sm:table-cell">Centro</Th>
                    <Th>Frequência</Th>
                    <Th>Vencimento</Th>
                    <Th className="text-right">Valor</Th>
                    <Th className="hidden sm:table-cell">Status</Th>
                    <Th>Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTemplates.map((t) => (
                    <tr key={t.id} className="border-t odd:bg-slate-50/40 hover:bg-slate-50">
                      <Td className="truncate max-w-[240px] sm:max-w-none">{t.title}</Td>
                      <Td className="hidden sm:table-cell">{t.category || "-"}</Td>
                      <Td className="hidden sm:table-cell">{t.cost_center || "-"}</Td>
                      <Td>{t.frequency === "annual" ? "Anual" : "Mensal"}</Td>
                      <Td className="whitespace-nowrap">
                        {t.frequency === "annual"
                          ? `Mês ${t.due_month} • Dia ${t.due_day}`
                          : `Dia ${t.due_day}`}
                      </Td>
                      <Td className="text-right tabular-nums font-mono whitespace-nowrap">{fmtBRL(t.amount)}</Td>
                      <Td className="hidden sm:table-cell">{t.active ? "ativo" : "inativo"}</Td>
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
              </div>
              {/* Cards (xs) */}
              <div className="sm:hidden divide-y">
                {filteredTemplates.map((t) => (
                  <div key={t.id} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 truncate">{t.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          {t.category && <span className="truncate max-w-[140px]">{t.category}</span>}
                          {t.cost_center && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{t.cost_center}</span>
                          )}
                          <span>{t.frequency === "annual" ? "Anual" : "Mensal"}</span>
                          <span className="whitespace-nowrap">
                            {t.frequency === "annual"
                              ? `Mês ${t.due_month} • Dia ${t.due_day}`
                              : `Dia ${t.due_day}`}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs ${t.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}`}>
                            {t.active ? 'ativo' : 'inativo'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-mono tabular-nums font-semibold">{fmtBRL(t.amount)}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button onClick={() => openEditTplModal(t)} className="px-2 py-1 border rounded">Editar</button>
                      <button onClick={() => onDeleteTpl(t)} className="px-2 py-1 border rounded">Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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

function KpiCard({ title, value, tone = "neutral" }) {
  const accent = {
    danger: "bg-rose-600",
    warning: "bg-amber-500",
    success: "bg-green-600",
    neutral: "bg-slate-300",
  }[tone] || "bg-slate-300";
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-4 overflow-hidden">
      <div className={`h-1 mx-4 ${accent} rounded-full mb-3`}></div>
      <div className="text-[11px] uppercase tracking-wide text-slate-600">{title}</div>
      <div className="text-base sm:text-xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}
function StatusPill({ status }) {
  const label = statusLabels[status] || status;
  const cls =
    status === 'paid' ? 'bg-emerald-100 text-emerald-800'
    : status === 'pending' ? 'bg-amber-100 text-amber-800'
    : status === 'canceled' ? 'bg-slate-200 text-slate-700'
    : 'bg-slate-100 text-slate-700';
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{label}</span>;
}
function Th({ children, className = "" }) {
  return <th className={`text-left px-2 py-2 sm:px-3 sm:py-2 font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }) {
  return <td className={`px-2 py-2 sm:px-3 sm:py-2 ${className}`}>{children}</td>;
}

function RowActions({ entry, updatingId, onPaid, onCancel, onReopen, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function onDocClick(e) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const isPending = entry.status === 'pending';
  const isBusy = updatingId === entry.id;

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
      >
        ⋯ Ações
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 origin-top-right rounded-md border bg-white shadow-lg z-50">
          <div className="py-1 text-sm">
            {isPending ? (
              <>
                <button
                  disabled={isBusy}
                  onClick={() => { setOpen(false); onPaid(entry); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                >
                  Marcar pago
                </button>
                <button
                  disabled={isBusy}
                  onClick={() => { setOpen(false); onCancel(entry); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                disabled={isBusy}
                onClick={() => { setOpen(false); onReopen(entry); }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
              >
                Reabrir
              </button>
            )}
            <div className="my-1 border-t" />
            <button
              disabled={isBusy}
              onClick={() => { setOpen(false); onDelete(entry); }}
              className="w-full text-left px-3 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Excluir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// src/app/(app)/financeiro/mensalidades/page.jsx
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useSession } from "@/contexts/SessionContext";
import { financeGateway } from "@/lib/financeGateway";
import { computeRevenueKPIs } from "@/lib/finance";

// Tradução de status para exibir na tabela
const statusLabels = {
  pending: "Pendente",
  paid: "Pago",
  canceled: "Cancelado",
};

function KpiCard({ title, value, tone = "neutral" }) {
  // Padrão "widget" do dashboard: cartão branco, borda sutil e leve sombra.
  const accent = {
    danger: "bg-rose-600",
    warning: "bg-amber-500",
    success: "bg-green-600",
    neutral: "bg-slate-300",
  }[tone] || "bg-slate-300";

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-4 overflow-hidden">
      <div className={`h-1 w-full ${accent} rounded-t-md -mt-1 mb-3`} />
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{title}</div>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Data BR com pontos: "YYYY-MM-DD" -> "DD.MM.YYYY"
const fmtBRDate = (s) => {
  if (!s) return "—";
  const parts = String(s).slice(0, 10).split("-");
  if (parts.length === 3) {
    const [Y, M, D] = parts;
    return `${D}.${M}.${Y}`;
  }
  try {
    return new Date(s + "T00:00:00").toLocaleDateString("pt-BR").replace(/\//g, ".");
  } catch {
    return s;
  }
};
function daysToDue(due) {
  const d0 = new Date(); d0.setHours(0,0,0,0);
  const d1 = new Date(String(due) + "T00:00:00"); d1.setHours(0,0,0,0);
  return Math.floor((d1 - d0) / 86400000);
}
function reminderStatus(due, status) {
  if (status !== "pending") return null;
  const dt = daysToDue(due); // dias até o vencimento
  if (dt < 0)  return "Atrasado";
  if (dt === 0) return "Vencido";
  if (dt > 0 && dt <= 7) return "A vencer";
  return null; // fora das janelas de lembrete
}
// ---- TEMPLATE DE LEMBRETE (padrão simples)
const REMINDER_TEMPLATES = {
  subject: ({ status, studentName, dueDateBR }) =>
    status === "Atrasado"
      ? `Pagamento em atraso – ${studentName} (venc. ${dueDateBR})`
      : status === "Vencido"
      ? `Vence hoje – ${studentName} (${dueDateBR})`
      : `Lembrete de vencimento – ${studentName} (${dueDateBR})`,

  html: ({ tenantName, studentName, dueDateBR, amountBRL, status }) => `
<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px">${tenantName}</h2>
  <p>Olá! Este é um ${
    status === "Atrasado" ? "<b>lembrete de atraso</b>" :
    status === "Vencido"  ? "<b>lembrete de vencimento hoje</b>" : "<b>lembrete de vencimento</b>"
  } referente à mensalidade de <b>${studentName}</b>.</p>
  <p><b>Vencimento:</b> ${dueDateBR}<br/>
     <b>Valor:</b> ${amountBRL}</p>
  <p>Se já realizou o pagamento, por favor desconsidere este aviso.</p>
  <p>Qualquer dúvida, fale com a secretaria.</p>
  <p style="margin-top:16px">— ${tenantName}</p>
</div>`,

  text: ({ tenantName, studentName, dueDateBR, amountBRL, status }) =>
`${tenantName}
${status === "Atrasado" ? "Lembrete de atraso" : (status === "Vencido" ? "Vence hoje" : "Lembrete de vencimento")}
Aluno: ${studentName}
Vencimento: ${dueDateBR}
Valor: ${amountBRL}

Se já pagou, desconsidere. Dúvidas, contate a secretaria.
— ${tenantName}`
};

// Constrói o e-mail a partir de uma linha da prévia
function buildReminderEmail(row, session) {
  const tenantName = session?.tenantName || "Sua escola";
  const studentName = row.student_name_snapshot || row.student_name || "Aluno";
  const dueDateBR = fmtBRDate(row.due_date);
  const amountBRL = fmtBRL(row.amount);
  const status = row.reminder_status; // "Atrasado" | "Vencido" | "A vencer"

  return {
    to: row.email_to,
    subject: REMINDER_TEMPLATES.subject({ status, studentName, dueDateBR }),
    html: REMINDER_TEMPLATES.html({ tenantName, studentName, dueDateBR, amountBRL, status }),
    text: REMINDER_TEMPLATES.text({ tenantName, studentName, dueDateBR, amountBRL, status }),
  };
}

// === NOVOS HELPERS: templates por tenant com fallback ===
function applyTemplate(str, vars) {
  if (!str) return "";
  return str.replace(/{{\s*(\w+)\s*}}/g, (_, k) => (vars?.[k] ?? ""));
}
async function getTenantReminderTemplate(status) {
  try {
    const res = await fetch(
      `/api/email-templates?kind=payment_reminder&status=${encodeURIComponent(status)}`,
      { method: "GET" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return { subject: data.subject || "", html: data.html || "", text: data.text || "" };
  } catch {
    return null;
  }
}
function makeTemplateVars(row, session) {
  return {
    tenantName: session?.tenantName || "Sua escola",
    studentName: row.student_name_snapshot || row.student_name || "Aluno",
    dueDate: fmtBRDate(row.due_date),
    amount: fmtBRL(row.amount),
    status: row.reminder_status,
  };
}
async function buildReminderEmailWithTenant(row, session, tplMap) {
  const v = makeTemplateVars(row, session);
  const tpl = tplMap.get(row.reminder_status) || null;

  if (tpl && (tpl.subject || tpl.html || tpl.text)) {
    return {
      to: row.email_to,
      subject: tpl.subject ? applyTemplate(tpl.subject, v) : REMINDER_TEMPLATES.subject({
        status: v.status, studentName: v.studentName, dueDateBR: v.dueDate
      }),
      html:    tpl.html    ? applyTemplate(tpl.html, v)    : REMINDER_TEMPLATES.html({
        tenantName: v.tenantName, studentName: v.studentName, dueDateBR: v.dueDate, amountBRL: v.amount, status: v.status
      }),
      text:    tpl.text    ? applyTemplate(tpl.text, v)    : REMINDER_TEMPLATES.text({
        tenantName: v.tenantName, studentName: v.studentName, dueDateBR: v.dueDate, amountBRL: v.amount, status: v.status
      }),
    };
  }

  return buildReminderEmail(row, session);
}

export default function MensalidadesPage() {
  // --- Estado para prévia de lembretes ---
  const [remPrevOpen, setRemPrevOpen] = useState(false);
  const [remPrevBusy, setRemPrevBusy] = useState(false);
  const [remRows, setRemRows] = useState([]); // linhas enriquecidas com email + bucket
// dias até o vencimento: negativo = já venceu


  // ---------- Sessão / Permissões (do contexto) ----------
  const sess = useSession(); // ✅ sempre chama o hook
  const session = sess?.session;
  const ready   = sess?.ready ?? false;
  console.log("Session debug:", sess);
  console.log("session keys:", Object.keys(session || {}));
console.log("tenant object:", session?.tenant);
console.log("tenant keys:", Object.keys(session?.tenant || {}));
console.log("user object:", session?.user);
console.log("user keys:", Object.keys(session?.user || {}));
console.log("claim object:", session?.claim);


  const isOwner = session?.role === "owner";
  const isAdmin = isOwner || session?.role === "admin";

  const financePerms = session?.perms?.finance || {};
  const canFinanceRead  = !!(isAdmin || financePerms.read);
 const canFinanceWrite = !!(isAdmin || financePerms.write);

   // ---------- Estado ----------
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7)); // "YYYY-MM"
  const [status, setStatus] = useState("all"); // all | pending | paid | canceled
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  const [revKpis, setRevKpis] = useState({
    receita_prevista_mes: 0,
    receita_a_receber: 0,
    receita_atrasada: 0,
    receita_recebida: 0,
  });

  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);

  // 🔐 Permissão vinda do BANCO (fonte da verdade p/ leitura)
  const [permChecked, setPermChecked] = useState(false);
  const [canReadDB, setCanReadDB] = useState(false);
  const [canWriteDB, setCanWriteDB]   = useState(false);

  // --- Receita total (Mensalidades + Outras Receitas)
  const [combined, setCombined] = useState(null);
  // Seleção na prévia de lembretes
const [selectedIds, setSelectedIds] = useState(new Set());
const [sendingRem, setSendingRem] = useState(false);

// Alterna seleção de uma linha
function toggleSelect(id) {
  setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

// Selecionar / limpar tudo (visível)
function selectAllVisible(flag) {
  setSelectedIds(flag ? new Set(remRows.map(r => r.id)) : new Set());
}

// Envio (selecionados ou todos)
// SUBSTITUA sua função sendReminders por ESTA versão
async function sendReminders({ onlySelected = false } = {}) {
  const pool = onlySelected
    ? remRows.filter(r => selectedIds.has(r.id))
    : remRows;

  const deliverables = pool.filter(r => !!r.email_to);
  if (deliverables.length === 0) {
    alert("Nada para enviar (sem e-mails válidos).");
    return;
  }

  if (!confirm(`Enviar ${deliverables.length} lembrete(s) agora?`)) return;

  setSendingRem(true);
  let ok = 0, fail = 0, skipped = pool.length - deliverables.length;

  try {
    const { supabase } = await import("@/lib/supabaseClient");

    // 1) buscar templates do tenant por status (apenas uma vez)
    const statuses = [...new Set(deliverables.map(r => r.reminder_status).filter(Boolean))];
    const tplMap = new Map();
    const fetched = await Promise.all(statuses.map(s => getTenantReminderTemplate(s)));
    statuses.forEach((s, i) => tplMap.set(s, fetched[i]));

    for (const r of deliverables) {
      // monta payload do e-mail com templates do tenant (fallback ao default)
      const payload = await buildReminderEmailWithTenant(r, session, tplMap);

      // dispara via Mailgun
      const res = await fetch("/api/send-mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // prepara dados para o log
      let providerId = null;
      let errorText = null;

      if (res.ok) {
        // /api/send-mail retorna { ok:true, id:"<mailgun-id>" }
        const data = await res.json().catch(() => ({}));
        providerId = data?.id ?? null;
        ok++;
      } else {
        // captura texto bruto do erro do /api/send-mail
        errorText = await res.text().catch(() => "Mail provider error");
        fail++;
      }

      // insere log (não bloqueia a UX se falhar)
      try {
        await supabase.from("finance_reminders_log").insert({
          tenant_id: session?.tenant?.id ?? session?.tenant_id ?? null,
          payment_id: r.id ?? null,
          student_id: r.student_id ?? null,
          payer_id: r.payer_id ?? null,
          to_email: r.email_to ?? null,           // <- nome correto na tabela
          subject: payload.subject ?? null,
          provider: "mailgun",
          provider_id: providerId,                // <- nome correto na tabela
          status: res.ok ? "sent" : "error",
          error_text: errorText,                  // texto curto/visível
          error_detail: null,                     // reserve p/ stack/trace se quiser
          payload: payload,                       // jsonb com subject/html/text
          sent_at: res.ok ? new Date().toISOString() : null,
        });
      } catch {
        // se o log falhar, só segue (não quebra o envio)
      }
    }

  alert(`Lembretes: enviados ${ok}, falhas ${fail}, sem e-mail ${skipped}.`);
  } catch (e) {
    alert(`Erro ao enviar: ${e?.message || e}`);
  } finally {
    setSendingRem(false);
  }
}

  useEffect(() => {
    let alive = true;
    async function loadCombined() {
      try {
        const data = await financeGateway.getCombinedRevenueKpis({ ym });
        if (alive) setCombined(data);
      } catch (e) {
        console.warn("[financeiro] getCombinedRevenueKpis:", e?.message || e);
        if (alive) setCombined({ total: 0, received: 0, upcoming: 0, overdue: 0 });
      }
    }
    loadCombined();
    return () => { alive = false; };
  }, [ym]);

  // 1) Checa permissão no banco via RPC (is_admin_or_finance_read)
  useEffect(() => {
    if (ready === false) return; // aguarda contexto inicializar
    (async () => {
       try {
        const { supabase } = await import("@/lib/supabaseClient");
        const { data: tenantId, error: tErr } = await supabase.rpc("current_tenant_id");
        if (tErr) throw tErr;

        const [readRes, writeRes] = await Promise.all([
        supabase.rpc("is_admin_or_finance_read",  { p_tenant: tenantId }),
        supabase.rpc("is_admin_or_finance_write", { p_tenant: tenantId }),
      ]);

      if (readRes.error)  throw readRes.error;
      if (writeRes.error) throw writeRes.error;

      setCanReadDB(!!readRes.data);
      setCanWriteDB(!!writeRes.data);
    } catch (e) {
      console.warn("perm check failed:", e);
      setCanReadDB(false);
      setCanWriteDB(false);
    } finally {
      setPermChecked(true);
    }
  })();
}, [ready]);

  // 2) Carregar dados
  useEffect(() => {
    if (ready === false || !canReadDB) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, canReadDB, ym, status]);

  // ---------- Derived values (must be before any returns) ----------
  const canPreview  = canReadDB  && typeof financeGateway.previewGenerateMonth === "function";
  const canGenerate =
  (canWriteDB /* write vindo do banco/RLS */) &&
  typeof financeGateway.generateMonth === "function";

  const title = useMemo(() => {
    if (!ym) return "Mensalidades";
    const [Y, M] = ym.split("-");
    return `Mensalidades – ${M}/${Y}`;
  }, [ym]);

  // ---------- Gate de rota (após TODOS os hooks) ----------
  if (ready === false || !permChecked) {
    return <div className="p-6">Carregando…</div>;
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
  // ---------- Carregar lista/KPIs ----------
  async function load() {
    setLoading(true);
    setError(null);

    // helper local para intervalo do mês por due_date
    const monthRange = (ymStr) => {
      const start = `${ymStr}-01`;
      const d = new Date(`${ymStr}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 1);
      const end = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
      return { start, end };
    };

    try {
      // 1) Tenta via gateway (mantém seu fluxo atual)
      const resp = await financeGateway.listPayments({
        ym,
        status: status === "all" ? undefined : status,
      });

      let loadedRows =
        Array.isArray(resp?.rows) ? resp.rows : Array.isArray(resp) ? resp : [];

      // 2) Fallback sem JOIN (RLS puro) se vier vazio/estranho
      if (!loadedRows || loadedRows.length === 0) {
        const { supabase } = await import("@/lib/supabaseClient");
        const { start, end } = monthRange(ym);

        let q = supabase
          .from("payments")
          .select(
            "id, tenant_id, status, due_date, amount, " +
              "student_name_snapshot, payer_name_snapshot, student_id, payer_id, paid_at, canceled_at"
          )
          .gte("due_date", start)
          .lt("due_date", end);

        if (status !== "all") q = q.eq("status", status);

        const { data, error } = await q;
        if (error) throw error;

        loadedRows = (data || []).map((r) => ({
          ...r,
          student_name: r.student_name_snapshot ?? r.student_id ?? "—",
          payer_name: r.payer_name_snapshot ?? r.payer_id ?? "—",
          days_overdue:
            r.status === "pending"
              ? Math.max(
                  0,
                  Math.floor(
                    (new Date().setHours(0, 0, 0, 0) -
                      new Date(String(r.due_date) + "T00:00:00").setHours(0, 0, 0, 0)) /
                      86400000
                  )
                )
              : 0,
        }));
      }

      // 3) Normaliza + KPIs
      const rowsNorm = (loadedRows || []).map((r) => ({
        ...r,
        amount: Number(r?.amount ?? 0),
      }));
      setRows(rowsNorm);

      const kpisNew = computeRevenueKPIs(rowsNorm, { ym, policy: "due_date" });
      setRevKpis(kpisNew);
    } catch (e) {
      setError(e?.message || String(e));
      setRows([]);
      setRevKpis({
        receita_prevista_mes: 0,
        receita_a_receber: 0,
        receita_atrasada: 0,
        receita_recebida: 0,
      });
    } finally {
      setLoading(false);
    }
  }

  // ---------- Prévia de geração ----------
async function openPreview() {
  if (!canPreview) {
    alert("Prévia indisponível no adaptador atual.");
    return;
  }
  setPreviewOpen(true);
  setPreviewLoading(true);
  try {
    // 0) monta chaves existentes no mês atual (já carregadas em `rows`)
    const existingKeys = new Set(
      (rows || [])
        .map(r => {
          const sid = r.student_id ?? r.student_id_snapshot ?? null;
          const due = r.due_date ? String(r.due_date).slice(0, 10) : null;
          return sid && due ? `${sid}::${due}` : null;
        })
        .filter(Boolean)
    );

    // 1) prévia “crua”
    const rawPrev = (await financeGateway.previewGenerateMonth({ ym })) || [];

    // 2) mantém só o que ainda NÃO foi gerado no mês
    const prev = rawPrev.filter(p => {
      const sid = p.student_id ?? null;
      const due = p.due_date ? String(p.due_date).slice(0, 10) : null;
      return !(sid && due && existingKeys.has(`${sid}::${due}`));
    });

    // 3) IDs de alunos
    const studentIds = [...new Set(prev.map((p) => p.student_id).filter(Boolean))];

    // 4) buscar alunos (nome + payer_id)
    const { supabase } = await import("@/lib/supabaseClient");
    let studs = [];
    if (studentIds.length) {
      const tries = ["id, full_name, payer_id", "id, name, payer_id"];
      for (const cols of tries) {
        const { data, error } = await supabase.from("students").select(cols).in("id", studentIds);
        if (!error) {
          studs = data || [];
          break;
        }
      }
    }

    // 5) índices
    const studentNameById = Object.create(null);
    const payerIdByStudentId = Object.create(null);
    for (const s of studs) {
      studentNameById[s.id] = s.full_name ?? s.name ?? "";
      payerIdByStudentId[s.id] = s.payer_id ?? null;
    }

    // 6) coletar payer_ids
    const payerIdsSet = new Set(prev.map((p) => p.payer_id).filter(Boolean));
    for (const sid of studentIds) {
      const pid = payerIdByStudentId[sid];
      if (pid) payerIdsSet.add(pid);
    }
    const payerIds = [...payerIdsSet];

    // 7) buscar pagadores (nome)
    let pays = [];
    if (payerIds.length) {
      const tries = ["id, name", "id, full_name"];
      for (const cols of tries) {
        const { data, error } = await supabase.from("payers").select(cols).in("id", payerIds);
        if (!error) {
          pays = data || [];
          break;
        }
      }
    }
    const payerNameById = Object.create(null);
    for (const p of pays) payerNameById[p.id] = p.name ?? p.full_name ?? "";

    // 8) enriquecer linhas
    const enriched = prev.map((r) => {
      const pid = r.payer_id ?? payerIdByStudentId[r.student_id] ?? null;
      return {
        ...r,
        student_name:
          r.student_name_snapshot ??
          studentNameById[r.student_id] ??
          r.student_name ??
          r.student_id,
        payer_name:
          r.payer_name_snapshot ??
          (pid ? payerNameById[pid] : undefined) ??
          r.payer_name ??
          "—",
      };
    });
    setPreview(enriched);
  } catch (e) {
    alert(e?.message || String(e));
  } finally {
    setPreviewLoading(false);
  }
}

  // ---------- Ações (somente para quem tem write) ----------
  // --- Resolver e-mails (payer → fallback student) ---
  async function resolveEmailsFor(rowsList) {
    const studentIds = [...new Set(rowsList.map(r => r.student_id).filter(Boolean))];
    const payerIds   = [...new Set(rowsList.map(r => r.payer_id).filter(Boolean))];

    const { supabase } = await import("@/lib/supabaseClient");

    // students: id, email, payer_id (tentamos colunas alternativas se necessário)
    let students = [];
    {
      const tries = ["id,email,payer_id", "id,student_email:email,payer_id"];
      for (const cols of tries) {
        const { data, error } = await supabase.from("students").select(cols).in("id", studentIds);
        if (!error) { students = data || []; break; }
      }
    }

    // payers: id, email
    let payers = [];
    {
      const tries = ["id,email", "id,contact_email:email"];
      for (const cols of tries) {
        const { data, error } = await supabase.from("payers").select(cols).in("id", payerIds);
        if (!error) { payers = data || []; break; }
      }
    }

    const emailByStudentId = Object.create(null);
    const payerIdByStudent = Object.create(null);
    students.forEach(s => {
      emailByStudentId[s.id] = s.email ?? s.student_email ?? null;
      payerIdByStudent[s.id] = s.payer_id ?? null;
    });

    const emailByPayerId = Object.create(null);
    payers.forEach(p => { emailByPayerId[p.id] = p.email ?? p.contact_email ?? null; });

    // enriquece cada linha com {email_to, email_source}
    return rowsList.map(r => {
      const pid = r.payer_id ?? payerIdByStudent[r.student_id] ?? null;
      const payerEmail   = pid ? emailByPayerId[pid] : null;
      const studentEmail = emailByStudentId[r.student_id] ?? null;
      const email_to     = payerEmail || studentEmail || null;
      const email_source = payerEmail ? "payer" : (studentEmail ? "student" : null);
      return { ...r, email_to, email_source };
    });
  }


// Adicione perto das outras actions
async function openReminderPreview() {
  setRemPrevOpen(true);
  setRemPrevBusy(true);
  try {
    // mantém o mesmo filtro de janelas (D-7, D-3, D-1, D0, Vencido)
    const eligible = (rows || [])
      .filter(r => r.status === "pending")
      .map(r => ({ ...r, reminder_status: reminderStatus(r.due_date, r.status) }))
      .filter(r => !!r.reminder_status)
      // adiciona o "Status" simplificado para exibição
      .map(r => ({ ...r, reminder_status: reminderStatus(r.due_date, r.status) }));

    const enriched = await resolveEmailsFor(eligible);

    // ordena por Status (Atrasado > Vencido > A vencer), depois por data e nome
    const order = { "Atrasado": 0, "Vencido": 1, "A vencer": 2 };
    enriched.sort((a, b) => {
      const byStatus = (order[a.reminder_status] ?? 99) - (order[b.reminder_status] ?? 99);
      if (byStatus !== 0) return byStatus;
      const byDue = new Date(a.due_date) - new Date(b.due_date);
      if (byDue !== 0) return byDue;
      const an = (a.student_name_snapshot || a.student_name || "").toString();
      const bn = (b.student_name_snapshot || b.student_name || "").toString();
      return an.localeCompare(bn, "pt-BR");
    });

    setRemRows(enriched);
  } catch (e) {
    alert(e?.message || String(e));
    setRemRows([]);
  } finally {
    setRemPrevBusy(false);
  }
}

  async function doGenerate() {
    if (!canGenerate) {
      alert("Geração indisponível no adaptador atual.");
      return;
    }
    if (!canFinanceWrite) {
      alert("Você não tem permissão para gerar mensalidades.");
      return;
    }
    if (!confirm("Gerar cobranças do mês para alunos ativos?")) return;
    setGenLoading(true);
    try {
      await financeGateway.generateMonth({ ym });
      setPreviewOpen(false);
      await load();
      alert("Mensalidades geradas com sucesso.");
    } catch (e) {
      alert(e.message || String(e));
    } finally {
      setGenLoading(false);
    }
  }

  async function markPaid(id) {
    if (!canFinanceWrite) {
      alert("Você não tem permissão para marcar pagamentos como pagos.");
      return;
    }
    try {
      await financeGateway.markPaid(id);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function reopen(id) {
    if (!canFinanceWrite) {
      alert("Você não tem permissão para reabrir pagamentos.");
      return;
    }
    try {
      await financeGateway.reopenPayment(id);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function cancel(id) {
    if (!canFinanceWrite) {
      alert("Você não tem permissão para cancelar pagamentos.");
      return;
    }
    const note = prompt("Motivo do cancelamento (opcional):") || null;
    try {
      await financeGateway.cancelPayment(id, note);
      await load();
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  // ---------- Componente: quitação em lote por pagador (só para write) ----------
  // ---------- Componente: quitação em lote por pagador (só para write) ----------
function BulkPayByPayer({ rows, ym, onDone }) {
  const [open, setOpen] = useState(false);
  const [payerId, setPayerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [payerOptions, setPayerOptions] = useState([]);

  useEffect(() => {
    (async () => {
      if (!open) {
        setPayerOptions([]);
        return;
      }
      const { supabase } = await import("@/lib/supabaseClient");

      // tentar ordenar por 'name' e, se não houver, cair para 'full_name'
      let payers = [];
      let q1 = await supabase.from("payers").select("id, name").order("name", { ascending: true });
      if (q1.error) {
        const q2 = await supabase
          .from("payers")
          .select("id, full_name")
          .order("full_name", { ascending: true });
        payers = q2.data || [];
      } else {
        payers = q1.data || [];
      }

      const opts = (payers || [])
        .map((p) => ({
          value: p.id,
          label: p.name ?? p.full_name ?? `Pagador ${String(p.id).slice(0, 6)}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

      setPayerOptions(opts);
    })();
  }, [open]);

  function monthRange(ymStr) {
    const start = `${ymStr}-01`;
    const d = new Date(`${ymStr}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const end = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return { start, end };
  }

  async function confirmBulkPay() {
    if (!payerId) {
      alert("Selecione um pagador.");
      return;
    }
    if (!canFinanceWrite) {
      alert("Você não tem permissão para quitar em lote.");
      return;
    }
    setBusy(true);
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const { start, end } = monthRange(ym);

      const q = supabase
        .from("payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("payer_id", payerId)
        .eq("status", "pending")
        .gte("due_date", start)
        .lt("due_date", end)
        .select("id", { count: "exact" });

      const { data, error, count } = await q;
      if (error) throw error;

      setOpen(false);
      setPayerId("");
      await onDone?.();
      alert(`Pagamentos marcados como pagos: ${count ?? (Array.isArray(data) ? data.length : 0)}`);
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!canFinanceWrite) return null; // não renderiza para quem não pode escrever

  return (
    <div className="w-full">
      {/* Botão proeminente alinhado à direita */}
      <div className="flex justify-end">
        <button
          onClick={() => setOpen((v) => !v)}
          className={[
            "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
            "border border-slate-300 bg-white text-slate-700",
            "hover:bg-slate-50",
            "focus:outline-none focus:ring-2 focus:ring-slate-300",
            "shadow-sm"
          ].join(" ")}
          title="Registrar recebimento de vários boletos do mesmo pagador"
          aria-label="+ Receber de um aluno"
        >
          <span className="i-lucide-users h-4 w-4" />
          + Receber de um aluno
          <span className={`i-lucide-chevron-down h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {/* Painel inline (sem Modal) */}
      {open && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Selecione o pagador</label>
              <select
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="">Selecione…</option>
                {payerOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              {payerOptions.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">Nenhum pagador com pendências em {ym}.</p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                onClick={confirmBulkPay}
                className="rounded bg-black text-white px-3 py-2 text-sm disabled:opacity-60"
                disabled={busy || !payerId}
              >
                {busy ? "Processando…" : "Confirmar pagamento"}
              </button>
            </div>
          </div>

          <p className="mt-2 text-xs text-slate-600">
            Todos os pagamentos <strong>pendentes</strong> dos <u>alunos deste pagador</u> em {ym} serão
            marcados como <strong>pagos</strong>.
          </p>
        </div>
      )}
    </div>
  );
}

  // ---------- Render ----------
  return (
    <main className="p-0 md:p-6 space-y-6">
      {/* Barra de filtros sticky */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b px-4 md:px-6 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <h1 className="text-xl md:text-2xl font-bold mr-2">{title}</h1>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-600 mb-1">Mês</label>
              <input
                type="month"
                value={ym}
                onChange={(e) => setYm(e.target.value.slice(0, 7))}
                className="rounded border px-2 py-1 text-sm text-slate-700 bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-600 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded border px-2 py-1 text-sm text-slate-700 bg-white"
              >
                <option value="all">Todos</option>
                <option value="pending">Pendentes</option>
                <option value="paid">Pagos</option>
                <option value="canceled">Cancelados</option>
              </select>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {canPreview && (
              <button
                onClick={openPreview}
                className="rounded px-3 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm"
              >
                Prévia
              </button>
            )}
            <button
              onClick={openReminderPreview}
              className="rounded px-3 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm"
            >
              Lembretes
            </button>
          </div>
        </div>
      </header>

  {/* Botão/painel "+ Receber de um aluno" (somente write) */}
      <BulkPayByPayer rows={rows} ym={ym} onDone={load} />

      

      {/* KPIs */}
      {!loading && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total faturado"
            value={fmtBRL(revKpis.receita_prevista_mes + revKpis.receita_recebida)}
            tone="neutral"
          />
          <KpiCard
            title="Recebido"
            value={fmtBRL(revKpis.receita_recebida)}
            tone="success"
          />
          <KpiCard
            title="Pendente"
            value={fmtBRL(revKpis.receita_a_receber + revKpis.receita_atrasada)}
            tone="warning"
          />
          <KpiCard
            title="Em atraso"
            value={fmtBRL(revKpis.receita_atrasada)}
            tone="danger"
          />
        </section>
      )}

      {/* Lista responsiva */}
      {loading ? (
        <div className="p-4">Carregando…</div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="md:hidden space-y-2 px-4">
            {rows.length === 0 ? (
              <div className="p-4 text-center text-slate-500 border rounded">Nenhum lançamento.</div>
            ) : (
              rows.map((r) => {
                const id = r.id;
                const statusText = r.status === "pending" ? (r.days_overdue > 0 ? "Atrasado" : "Pendente") : (statusLabels?.[r.status] ?? r.status ?? "—");
                return (
                  <div key={id} className="rounded border p-3 bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate">{r.student_name_snapshot || r.student_name || "—"}</div>
                      <div className="text-sm whitespace-nowrap">{fmtBRL(r.amount)}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-600 flex items-center justify-between">
                      <span>Vence: {fmtBRDate(r.due_date)}</span>
                      <span>
                        {statusText}
                        {r.status === "pending" && r.days_overdue > 0 && (
                          <span className="ml-1 text-rose-700">({r.days_overdue}d)</span>
                        )}
                      </span>
                    </div>
                    <div className="mt-2">
                      {canFinanceWrite ? (
                        <RowActions
                          entry={{ id, status: r.status }}
                          onPaid={(e) => markPaid(e.id)}
                          onCancel={(e) => cancel(e.id)}
                          onReopen={(e) => reopen(e.id)}
                        />
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop: tabela compacta (sem coluna Pagador) com cabeçalho no padrão (gradiente apenas na linha) */}
          <div className="hidden md:block overflow-auto border rounded-md overflow-hidden mx-4 md:mx-0">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-rose-900 to-rose-700 text-white">
                  <th className="text-left text-xs font-semibold uppercase tracking-wide px-3 py-2">Aluno</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wide px-3 py-2">Vencimento</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wide px-3 py-2">Valor</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wide px-3 py-2">Status</th>
                  <th className="text-left text-xs font-semibold uppercase tracking-wide px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-500">Nenhum lançamento.</td>
                  </tr>
                )}
                {rows.map((r) => {
                  const id = r.id;
                  return (
                    <tr key={id} className="border-t">
                      <Td>{r.student_name_snapshot || r.student_name || "—"}</Td>
                      <Td>{fmtBRDate(r.due_date)}</Td>
                      <Td>{fmtBRL(r.amount)}</Td>
                      <Td>
                        {r.status === "pending" ? (r.days_overdue > 0 ? "Atrasado" : "Pendente") : (statusLabels?.[r.status] ?? r.status ?? "—")}
                        {r.status === "pending" && r.days_overdue > 0 && (
                          <span className="ml-2 text-red-600 text-xs">({r.days_overdue}d)</span>
                        )}
                      </Td>
                      <Td>
                        {canFinanceWrite ? (
                          <RowActions
                            entry={{ id, status: r.status }}
                            onPaid={(e) => markPaid(e.id)}
                            onCancel={(e) => cancel(e.id)}
                            onReopen={(e) => reopen(e.id)}
                          />
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal simples de prévia */}
      {previewOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded shadow-xl w-full max-w-2xl">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Prévia de geração ({ym})</div>
              <button onClick={() => setPreviewOpen(false)} className="text-slate-500">
                ✕
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-auto">
              {previewLoading ? (
                <div>Carregando…</div>
              ) : preview.length === 0 ? (
                <div className="text-slate-500">Nada a gerar.</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Aluno</Th>
                      <Th>Pagador</Th>
                      <Th>Vencimento</Th>
                      <Th>Valor?</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p, i) => (
                      <tr key={`${p.student_id}:${i}`} className="border-t">
                        <Td>{p.student_name}</Td>
                        <Td>{p.payer_name}</Td>
                        <Td>{fmtBRDate(p.due_date)}</Td>
                        <Td>{fmtBRL(p.amount)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={() => setPreviewOpen(false)} className="px-3 py-2 border rounded">
                Fechar
              </button>
              {canGenerate && (
                <button
                  onClick={doGenerate}
                  disabled={previewLoading || genLoading || preview.length === 0}
                  className="px-3 py-2 border rounded bg-emerald-600 text-white disabled:opacity-50"
                >
                  {genLoading ? "Gerando…" : "Gerar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    {remPrevOpen && (
  <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
    <div className="bg-white rounded shadow-xl w-full max-w-3xl">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="font-semibold">Prévia de lembretes ({ym})</div>
          {isAdmin && (
            <a
              href="/app/conta#comunicacao"
              className="text-sm text-slate-700 underline hover:no-underline"
              title="Configurar templates de e-mail do tenant"
            >
              Configurar templates
            </a>
          )}
        </div>
        <button onClick={() => setRemPrevOpen(false)} className="text-slate-500">✕</button>
      </div>

      <div className="p-4 max-h-[70vh] overflow-auto">
        {remPrevBusy ? (
          <div>Carregando…</div>
        ) : remRows.length === 0 ? (
          <div className="text-slate-500">
           Nenhum aluno com cobrança atrasada, vencendo hoje ou nos próximos 7 dias.
          </div>
        ) : (
          <>
            {/* Resumo por status */}
            <div className="mb-3 text-sm text-slate-700">
              {["Atrasado","Vencido","A vencer"].map(tag => {
                const n = remRows.filter(r => r.reminder_status === tag).length;
                return (
                  <span key={tag} className="inline-block mr-3">
                    <b>{tag}:</b> {n}
                  </span>
                );
              })}
              <span className="inline-block ml-4">
                <b>Sem e-mail:</b> {remRows.filter(r => !r.email_to).length}
              </span>
            </div>

            {/* Barra de ações */}
<div className="mb-2 flex items-center justify-between">
  <div className="text-sm text-slate-700">
    <button
      className="mr-2 underline"
      onClick={() => selectAllVisible(true)}
    >
      Selecionar todos
    </button>
    <button
      className="underline"
      onClick={() => selectAllVisible(false)}
    >
      Limpar seleção
    </button>
    <span className="ml-3 opacity-70">
      Selecionados: {selectedIds.size}
    </span>
  </div>

  <div className="flex gap-2">
    <button
      onClick={() => sendReminders({ onlySelected: true })}
  className="px-3 py-2 border rounded bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      disabled={sendingRem || selectedIds.size === 0}
      title="Enviar somente para os selecionados"
    >
      {sendingRem ? "Enviando…" : "Enviar selecionados"}
    </button>
    <button
      onClick={() => sendReminders({ onlySelected: false })}
  className="px-3 py-2 border rounded bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      disabled={sendingRem || remRows.length === 0}
      title="Enviar para todos listados"
    >
      {sendingRem ? "Enviando…" : "Enviar todos"}
    </button>
  </div>
</div>

{/* Tabela com seleção */}
<div className="overflow-auto border rounded">
  <table className="min-w-[780px] w-full">
    <thead className="bg-slate-50">
      <tr>
        <Th></Th>
        <Th>Status</Th>
        <Th>Aluno</Th>
        <Th>Vencimento</Th>
        <Th>E-mail</Th>
      </tr>
    </thead>
    <tbody>
      {remRows.map(r => (
        <tr key={r.id} className="border-t">
          <Td>
            <input
              type="checkbox"
              checked={selectedIds.has(r.id)}
              onChange={() => toggleSelect(r.id)}
              aria-label={`Selecionar ${r.student_name_snapshot || r.student_name || "Aluno"}`}
            />
          </Td>
          <Td>{r.reminder_status}</Td>
          <Td>{r.student_name_snapshot || r.student_name || "—"}</Td>
          <Td>{fmtBRDate(r.due_date)}</Td>
          <Td>
            {r.email_to ? (
              <span className="text-slate-800">
                {r.email_to}
                <span className="ml-2 text-xs text-slate-500">
                  ({r.email_source === "payer" ? "pagador" : "aluno"})
                </span>
              </span>
            ) : (
              <span className="text-rose-700 font-medium">— sem e-mail —</span>
            )}
          </Td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
          </>
        )}
      </div>

   <div className="p-4 border-t flex justify-end">
  <button onClick={() => setRemPrevOpen(false)} className="px-3 py-2 border rounded">
    Fechar
  </button>
</div>
    </div>
  </div>
)}

    </main>
  );
}

// ---------- helpers UI ----------
function Th({ children }) {
  return (
    <th className="text-left text-xs font-semibold uppercase tracking-wide px-3 py-2 text-slate-600">
      {children}
    </th>
  );
}
function Td({ children }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}
function Btn({ children, onClick, variant = "primary" }) {
  const base = "inline-flex items-center gap-2 px-2 py-1 rounded border text-sm mr-2";
  const styles =
    variant === "danger"
      ? "border-rose-600 text-rose-700"
      : variant === "secondary"
      ? "border-slate-400 text-slate-700"
  : "border-slate-300 text-slate-700";
  return (
    <button className={`${base} ${styles}`} onClick={onClick}>
      {children}
    </button>
  );
}

// Dropdown de ações por linha (Padronizado)
function RowActions({ entry, onPaid, onCancel, onReopen }) {
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

  return (
    <>
      <div className="relative inline-block text-left" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50"
        >
          ⋯ Ações
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}>
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z" clipRule="evenodd" />
          </svg>
        </button>
        {/* Dropdown para >= sm */}
        {open && (
          <div className="hidden sm:block absolute right-0 mt-1 w-40 origin-top-right rounded-md border bg-white shadow-lg z-40">
            <div className="py-1 text-sm">
              {isPending ? (
                <>
                  <button
                    onClick={() => { setOpen(false); onPaid?.(entry); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50"
                  >
                    Marcar pago
                  </button>
                  <button
                    onClick={() => { setOpen(false); onCancel?.(entry); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setOpen(false); onReopen?.(entry); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50"
                >
                  Reabrir
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Overlay centralizado para mobile */}
      {open && (
        <div className="sm:hidden fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setOpen(false)}>
          <div className="w-[86vw] max-w-xs rounded-lg border bg-white shadow-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-2 font-medium text-white/95 bg-gradient-to-br from-[var(--fix-primary-700)] via-[var(--fix-primary-600)] to-[var(--fix-primary)]">Ações</div>
            <div className="py-1 text-sm">
              {isPending ? (
                <>
                  <button
                    onClick={() => { setOpen(false); onPaid?.(entry); }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50"
                  >
                    Marcar pago
                  </button>
                  <button
                    onClick={() => { setOpen(false); onCancel?.(entry); }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { setOpen(false); onReopen?.(entry); }}
                  className="w-full text-left px-4 py-2 hover:bg-slate-50"
                >
                  Reabrir
                </button>
              )}
            </div>
            <div className="px-3 py-2 border-t text-right">
              <button className="px-3 py-1.5 text-sm border rounded hover:bg-slate-50" onClick={() => setOpen(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

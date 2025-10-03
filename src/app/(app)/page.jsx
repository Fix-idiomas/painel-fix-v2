"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/contexts/SessionContext";
import Modal from "@/components/Modal";
import { financeGateway } from "@/lib/financeGateway";
import { computeRevenueKPIs } from "@/lib/finance";
import { supabase } from "@/lib/supabaseClient";

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TZ = "America/Sao_Paulo";
const fmtBRDateDots = (s) => {
  if (!s) return "—";
  const [Y, M, D] = String(s).slice(0, 10).split("-");
  return `${D}.${M}.${Y}`;
};
const ymAddMonths = (ym, delta) => {
  const [Y, M] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(Y, (M - 1) + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export default function Page() {
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7));
  const [panelGroup, setPanelGroup] = useState("receitas");
  const [showValues, setShowValues] = useState(true);
  const [openMail, setOpenMail] = useState(false);
  const [mailForm, setMailForm] = useState({ to: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  const [revKpis, setRevKpis] = useState({});
  const [kpisFin, setKpisFin] = useState({});
  const [kpisExp, setKpisExp] = useState({});
  const [counts, setCounts] = useState({ studentsActive: 0 });
  const [upcoming, setUpcoming] = useState([]);   // vencem nos próximos 7 dias
  const [birthdays, setBirthdays] = useState([]); // aniversariantes do mês

  // 🔑 DB-first: sessão/permissões reais
  const { ready, isAdmin, perms, session } = useSession();
  const canReadFinance  = isAdmin || !!perms?.finance?.read;
  const canWriteFinance = isAdmin || !!perms?.finance?.write;
  const canReadRegistry = isAdmin || !!perms?.registry?.read; // p/ students (aniversários)

  function maskMoney(n) { return showValues ? fmtBRL(n) : "•••"; }
  function maskCount(n)  { return showValues ? String(n) : "••"; }

  async function load() {
    let alive = true;
    setLoading(true);
    try {
      // pagamentos + despesas (somente se pode ler Financeiro)
       const [payments, expenses] = await Promise.all([
        canReadFinance ? financeGateway.listPayments({ ym }) : Promise.resolve({ rows: [], kpis: {} }),
        canReadFinance ? financeGateway.listExpenseEntries({ ym }) : Promise.resolve({ kpis: {} }),
]);
    
  if (!alive) return;

    const rows = payments?.rows || [];
    const kpisNew = computeRevenueKPIs(rows, { ym, policy: "due_date" });
    setRevKpis(kpisNew);

    const finKpis = {
      billed: Number(payments?.kpis?.total_billed || 0),
      paid: Number(payments?.kpis?.total_paid || 0),
      pending: Number(payments?.kpis?.total_pending || 0),
      overdueMoney: Number(
        rows
          .filter((r) => r.status === "pending" && (r.days_overdue || 0) > 0)
          .reduce((a, b) => a + Number(b.amount || 0), 0)
      ),
    };

    const expKpis = {
      total:   Number(expenses?.kpis?.total   || 0),
      paid:    Number(expenses?.kpis?.paid    || 0),
      pending: Number(expenses?.kpis?.pending || 0),
      overdue: Number(expenses?.kpis?.overdue || 0),
      teachers:Number(expenses?.kpis?.teachers|| 0),
    };

     // ===== Próximos 7 dias =====
      const nowSP  = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
      const todayISO = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(nowSP);
      const plus7 = new Date(nowSP); plus7.setDate(plus7.getDate() + 7);
      const endISO = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(plus7);

      let rows7 = [];
      try {
        if (canReadFinance) {
          const { data, error } = await supabase
            .from("payments")
            .select("id, student_id, payer_id, student_name_snapshot, payer_name_snapshot, amount, due_date, status")
            .eq("status", "pending")
            .gte("due_date", todayISO)
            .lte("due_date", endISO)
            .order("due_date", { ascending: true })
            .limit(200);
          if (error) throw error;
          rows7 = data || [];
        }
      } catch {
        // fallback: usa gateway por mês
        const ymNow  = todayISO.slice(0, 7);
        const ymNext = ymAddMonths(ymNow, 1);
        const [dueNow, dueNext] = await Promise.all([
          canReadFinance ? financeGateway.listPayments({ ym: ymNow,  status: "pending" }) : Promise.resolve([]),
          canReadFinance ? financeGateway.listPayments({ ym: ymNext, status: "pending" }) : Promise.resolve([]),
        ]);
        const rowsNow  = Array.isArray(dueNow?.rows)  ? dueNow.rows  : Array.isArray(dueNow)  ? dueNow  : [];
        const rowsNext = Array.isArray(dueNext?.rows) ? dueNext.rows : Array.isArray(dueNext) ? dueNext : [];
        rows7 = [...rowsNow, ...rowsNext].filter(r => r?.due_date >= todayISO && r?.due_date <= endISO);
      }

      // completar nomes (se permitido acessar cadastros)
      const needStudent = [...new Set(rows7.filter(r => !r.student_name_snapshot && r.student_id).map(r => r.student_id))];
      const needPayer   = [...new Set(rows7.filter(r => !r.payer_name_snapshot   && r.payer_id).map(r => r.payer_id))];

      const studentNameById = Object.create(null);
      const payerNameById   = Object.create(null);

      if (canReadRegistry && needStudent.length) {
       
        let q1 = await supabase.from("students").select("id, full_name").in("id", needStudent);
        let sList = q1.error
          ? (await supabase.from("students").select("id, name").in("id", needStudent)).data
          : q1.data;
        for (const s of sList || []) studentNameById[s.id] = s.full_name ?? s.name ?? "";
      }
      if (canReadRegistry && needPayer.length) {
      
        let p1 = await supabase.from("payers").select("id, name").in("id", needPayer);
        let pList = p1.error
          ? (await supabase.from("payers").select("id, full_name").in("id", needPayer)).data
          : p1.data;
        for (const p of pList || []) payerNameById[p.id] = p.name ?? p.full_name ?? "";
      }

      const up = rows7
        .map((r) => ({
          id: r.id,
          due_date: r.due_date,
          amount: Number(r.amount || 0),
          student_name: r.student_name_snapshot ?? studentNameById[r.student_id] ?? "—",
          payer_name:   r.payer_name_snapshot   ?? payerNameById[r.payer_id]     ?? "—",
          isToday: r.due_date === todayISO,
        }))
        .sort((a, b) => a.due_date.localeCompare(b.due_date));

      if (!alive) return;
            setUpcoming(up);

   // ===== Students (ativos) + Aniversariantes do mês =====

      let students = [];
      if (canReadRegistry) {
        const res = await financeGateway.listStudents(); // seu adapter já usa supabaseGateway (anon/RLS)
        students = Array.isArray(res) ? res : Array.isArray(res?.rows) ? res.rows : [];
      }
      const nowSPBirthday = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
      const mm = nowSPBirthday.getMonth() + 1;

      // TODOS os alunos ativos (para o KPI)
      const activeStudentsAll = (students || []).filter(s => (s?.status || "").toLowerCase() === "ativo").length;

      const list = (students || [])
        .filter(s => (s?.status || "").toLowerCase() === "ativo")
        .map(s => {
          const name = s.full_name ?? s.name ?? "";
          const dob  = s.birth_date ?? s.date_of_birth ?? null;
          if (!name || !dob) return null;
          const m = Number(String(dob).slice(5, 7));
          if (m !== mm) return null;
          const d = Number(String(dob).slice(8, 10));
          return { id: s.id, name, dd: d };
        })
        .filter(Boolean)
        .sort((a, b) => a.dd - b.dd);

      if (!alive) return;
      setBirthdays(list);
      setKpisFin(finKpis);
      setKpisExp(expKpis);
      setCounts({ studentsActive: activeStudentsAll }); // ✅ agora é o total de alunos ativos
    } catch (e) {
      // opcional: console.warn("Dashboard load error:", e);
    } finally {
      if (alive) setLoading(false);
    }
   }


  // carrega dados quando permitido
  useEffect(() => {
    if (!ready) return;
    if (!canReadFinance && !canReadRegistry) return; // nada para mostrar
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ym, canReadFinance, canReadRegistry]);

  // foco/visibilidade → reload
  useEffect(() => {
    let alive = true;
    const onFocus = () => { if (!alive) return; if (canReadFinance || canReadRegistry) load(); };
    const onVisible = () => {
      if (!alive) return;
      if (document.visibilityState === "visible" && (canReadFinance || canReadRegistry)) load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ym, canReadFinance, canReadRegistry]); // reanexa quando condições mudarem

  if (!ready) {
    return (
      <main className="p-6">
        <div className="animate-pulse text-sm text-gray-600">Preparando sessão…</div>
      </main>
    );
  }

  // se não pode ler nada relevante da Home, bloqueia
  if (!canReadFinance && !canReadRegistry) {
    return (
      <main className="p-6 text-sm text-gray-600">
        Acesso negado.
      </main>
    );
  }

  // “perfil professor puro”: sem finanças e com classes
  const isTeacherOnly = !isAdmin && !!perms?.classes?.write && !canReadFinance;
  if (isTeacherOnly) {
    return (
      <main className="p-6 text-sm text-gray-600">
        Redirecionando para sua agenda…
      </main>
    );
  }

  // Regra de cor para alunos ativos
  const activeStudents = Number(counts.studentsActive ?? 0);
  const activeStudentsTone =
    activeStudents >= 36 ? "success"
    : activeStudents >= 25 ? "warning"
    : "danger";

  async function onSendMail(e) {
    e?.preventDefault?.();
    try {
      setSending(true);
      const to = mailForm.to.trim();
      const subject = mailForm.subject.trim();
      const message = mailForm.message.trim();
      if (!to) throw new Error("Informe o(s) destinatário(s).");
      if (!subject) throw new Error("Informe o assunto.");
      if (!message) throw new Error("Escreva a mensagem.");
      // 🔑 chamada real para Mailgun via rota /api/send-mail
    const res = await fetch("/api/send-mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject,
        html: `<p>${message.replace(/\n/g, "<br/>")}</p>`,
        text: message
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Falha no envio");
      alert("E-mail enviado ✅");
      setOpenMail(false);
      setMailForm({ to: "", subject: "", message: "" });
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Início</h1>
          <label className="text-sm text-slate-600">Mês:</label>
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value.slice(0, 7))}
            className="border rounded px-2 py-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={panelGroup}
            onChange={(e) => setPanelGroup(e.target.value)}
            className="border rounded px-2 py-2"
            title="Escolha o conjunto de cards"
          >
            <option value="receitas">Receitas</option>
            <option value="gastos">Gastos</option>
            <option value="custos">Custos</option>
          </select>
          <button
            onClick={() => setShowValues((v) => !v)}
            className="border rounded px-3 py-2"
          >
            {showValues ? "Ocultar valores" : "Mostrar valores"}
          </button>
          <button onClick={() => setOpenMail(true)} className="border rounded px-3 py-2">
            Enviar e-mail
          </button>
        </div>
      </div>

      {/* KPIs */}
      {loading ? (
        <div className="p-4">Carregando…</div>
      ) : (
        <>
          {/* 1ª linha: Alunos ativos */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi title="Alunos ativos" value={maskCount(counts.studentsActive)} tone={activeStudentsTone} />
          </section>

          {/* 2ª linha: cards conforme grupo */}
          {panelGroup === "receitas" && (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi title="Receita prevista"  value={maskMoney(revKpis?.receita_prevista_mes || 0)} />
              <Kpi title="Receita recebida"  value={maskMoney(revKpis?.receita_recebida    || 0)} />
              <Kpi title="Receita atrasada"  value={maskMoney(revKpis?.receita_atrasada    || 0)} />
              <Kpi title="Receita a receber" value={maskMoney(revKpis?.receita_a_receber   || 0)} />
            </section>
          )}

          {panelGroup === "gastos" && (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Kpi title="Gastos totais"    value={maskMoney(kpisExp.total)} />
              <Kpi title="Gastos pagos"     value={maskMoney(kpisExp.paid)} />
              <Kpi title="Gastos em atraso" value={maskMoney(kpisExp.overdue)} />
            </section>
          )}

          {panelGroup === "custos" && (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Kpi title="Custo professores" value={maskMoney(kpisExp.teachers || 0)} />
            </section>
          )}
        </>
      )}

      {/* Próximos 7 dias + Aniversariantes do mês */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="border rounded overflow-hidden">
          <div className="px-3 py-2 border-b bg-slate-50 font-semibold">Vencem nos próximos 7 dias</div>
          {upcoming.length === 0 ? (
            <div className="p-4 text-slate-600">Nada a vencer no período.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Vencimento</Th>
                  <Th>Aluno</Th>
                  <Th>Pagador</Th>
                  <Th className="text-right">Valor</Th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((r) => (
                  <tr key={r.id} className="border-t">
                    <Td>
                      {fmtBRDateDots(r.due_date)}
                      {r.isToday && (
                        <span className="ml-2 rounded-full px-2 py-0.5 text-xs bg-amber-100 text-amber-800">Hoje</span>
                      )}
                    </Td>
                    <Td>{r.student_name}</Td>
                    <Td>{r.payer_name}</Td>
                    <Td className="text-right">{maskMoney(r.amount)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border rounded overflow-hidden">
          <div className="px-3 py-2 border-b bg-slate-50 font-semibold">Aniversariantes do mês</div>
          {birthdays.length === 0 ? (
            <div className="p-4 text-slate-600">Nenhum aniversariante encontrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <Th style={{ width: 80 }}>Dia</Th>
                  <Th>Nome</Th>
                </tr>
              </thead>
              <tbody>
                {birthdays.map((b) => (
                  <tr key={b.id} className="border-t">
                    <Td>{String(b.dd).padStart(2, "0")}</Td>
                    <Td>{b.name}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Modal de E-mail */}
      <Modal
        open={openMail}
        onClose={() => setOpenMail(false)}
        title="Enviar e-mail"
        footer={
          <>
            <button onClick={() => setOpenMail(false)} className="px-3 py-2 border rounded" disabled={sending}>Cancelar</button>
            <button onClick={onSendMail} className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50" disabled={sending}>
              {sending ? "Enviando…" : "Enviar"}
            </button>
          </>
        }
      >
        <form onSubmit={onSendMail} className="grid gap-3">
          <div>
            <label className="block text-sm mb-1">Para* (separe por vírgula)</label>
            <input
              value={mailForm.to}
              onChange={(e) => setMailForm((f) => ({ ...f, to: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              placeholder="aluno@ex.com, responsavel@ex.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Assunto*</label>
            <input
              value={mailForm.subject}
              onChange={(e) => setMailForm((f) => ({ ...f, subject: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Mensagem*</label>
            <textarea
              value={mailForm.message}
              onChange={(e) => setMailForm((f) => ({ ...f, message: e.target.value }))}
              className="border rounded px-3 py-2 w-full"
              rows={8}
              placeholder="Escreva sua mensagem…"
              required
            />
          </div>
        </form>
      </Modal>
    </main>
  );
}

function Kpi({ title, value, tone = "neutral" }) {
  const toneBox = {
    danger:  "border-red-300 bg-red-50",
    warning: "border-amber-300 bg-amber-50",
    success: "border-green-300 bg-green-50",
    neutral: "border-slate-200 bg-white",
  }[tone] || "border-slate-200 bg-white";

  const toneText = {
    danger:  "text-red-800",
    warning: "text-amber-800",
    success: "text-green-800",
    neutral: "text-slate-900",
  }[tone] || "text-slate-900";

  return (
    <div className={`border rounded p-3 ${toneBox}`}>
      <div className={`text-xs ${toneText} opacity-80`}>{title}</div>
      <div className={`text-xl font-semibold ${toneText}`}>{value}</div>
    </div>
  );
}
function Th({ children, className = "", style }) {
  return (
    <th className={`text-left px-3 py-2 font-medium ${className}`} style={style}>
      {children}
    </th>
  );
}
function Td({ children, className = "", style }) {
  return (
    <td className={`px-3 py-2 ${className}`} style={style}>
      {children}
    </td>
  );
}

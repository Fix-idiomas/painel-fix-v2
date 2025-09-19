"use client";

import { useState, useEffect } from "react";
import Guard from "@/components/Guard";
import Modal from "@/components/Modal";
import { financeGateway } from "@/lib/financeGateway";
import { computeRevenueKPIs } from "@/lib/finance"; // ✅ import correto

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Page() {
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7)); // ✅ mês atual
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

  // mocks (substitua por useSession quando quiser)
  const [ready, setReady] = useState(true);
  const [session, setSession] = useState({ role: "admin" });

  function maskMoney(n) {
    return showValues ? fmtBRL(n) : "•••";
  }
  function maskCount(n) {
    return showValues ? String(n) : "••";
  }

  async function load() {
    setLoading(true);

    const [payments, expenses, students] = await Promise.all([
      financeGateway.listPayments({ ym }),
      financeGateway.listExpenseEntries({ ym }),
      financeGateway.listStudents(),
    ]);

    // 🔹 KPIs canônicos (policy fixa = "due_date")
    const rows = payments?.rows || [];
    const kpisNew = computeRevenueKPIs(rows, { ym, policy: "due_date" });
    setRevKpis(kpisNew);

    // (legado) financeiros — se quiser comparar por um tempo
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

    // despesas (gastos)
    const expKpis = {
      total: Number(expenses?.kpis?.total || 0),
      paid: Number(expenses?.kpis?.paid || 0),
      pending: Number(expenses?.kpis?.pending || 0),
      overdue: Number(expenses?.kpis?.overdue || 0),
    };

    // contagens
    const studentsActive = (students || []).filter((s) => s.status === "ativo").length;

    setKpisFin(finKpis);
    setKpisExp(expKpis);
    setCounts({ studentsActive });
    setLoading(false);
  }

  useEffect(() => {
    if (!ready) return;
    if (session?.role === "professor") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ym, session?.role]);

  useEffect(() => {
    if (!ready) return;
    if (session?.role === "professor") {
      // router.replace("/agenda"); // quando plugar o router
    }
  }, [ready, session?.role]);

  if (!ready) {
    return (
      <main className="p-6">
        <div className="animate-pulse text-sm text-gray-600">Preparando sessão…</div>
      </main>
    );
  }

  if (session?.role === "professor") {
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

      // await sendMail({ to, subject, html: ... });

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
    <Guard roles={["admin", "financeiro"]}>
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
            {/* 1ª linha: apenas Alunos ativos */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                title="Alunos ativos"
                value={maskCount(counts.studentsActive)}
                tone={activeStudentsTone}
              />
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
                <Kpi title="Gastos totais" value={maskMoney(kpisExp.total)} />
                <Kpi title="Gastos pagos"  value={maskMoney(kpisExp.paid)} />
                <Kpi title="Gastos em atraso" value={maskMoney(kpisExp.overdue)} />
              </section>
            )}

            {panelGroup === "custos" && (
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Kpi title="Custo professores" value={maskMoney(kpisExp.teachers || 0)} />
                {/* futuramente: outros custos por cost_center */}
              </section>
            )}
          </>
        )}

        {/* Modal de E-mail Geral */}
        <Modal
          open={openMail}
          onClose={() => setOpenMail(false)}
          title="Enviar e-mail"
          footer={
            <>
              <button
                onClick={() => setOpenMail(false)}
                className="px-3 py-2 border rounded"
                disabled={sending}
              >
                Cancelar
              </button>
              <button
                onClick={onSendMail}
                className="px-3 py-2 border rounded bg-rose-600 text-white disabled:opacity-50"
                disabled={sending}
              >
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
    </Guard>
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

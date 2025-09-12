"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Guard from "@/components/Guard";
import { useSession } from "@/contexts/SessionContext";
import { ADAPTER_NAME, financeGateway } from "@/lib/financeGateway";
import Modal from "@/components/Modal";
import { sendMail } from "@/lib/sendMailClient";


const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function HomePage() {
  const router = useRouter();
  const { session, ready } = useSession(); // ⬅️ agora usamos `ready`

  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7));
  const [showValues, setShowValues] = useState(true);
  const [panelGroup, setPanelGroup] = useState("receitas"); // "receitas" | "gastos"


  // dados
  const [kpisFin, setKpisFin] = useState({ billed: 0, paid: 0, pending: 0, overdueMoney: 0 });
  const [kpisExp, setKpisExp] = useState({ total: 0, paid: 0, pending: 0, overdue: 0 });
  const [counts, setCounts] = useState({ studentsActive: 0 });

  const [loading, setLoading] = useState(true);

  // modal e-mail
  const [openMail, setOpenMail] = useState(false);
  const [sending, setSending] = useState(false);
  const [mailForm, setMailForm] = useState({ to: "", subject: "", message: "" });

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

    // financeiros (receitas)
    const finKpis = {
      billed: Number(payments?.kpis?.total_billed || 0),
      paid: Number(payments?.kpis?.total_paid || 0),
      pending: Number(payments?.kpis?.total_pending || 0),
      overdueMoney: Number(
        (payments?.rows || [])
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

  // Carrega KPIs somente quando:
  // - a sessão estiver pronta (`ready === true`)
  // - o usuário NÃO for professor
  useEffect(() => {
    if (!ready) return;
    if (session?.role === "professor") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ym, session?.role]);

  // Redirect: professor não acessa Início (apenas após `ready`)
  useEffect(() => {
    if (!ready) return;
    if (session?.role === "professor") {
      router.replace("/agenda");
    }
  }, [ready, session?.role, router]);

  // Enquanto a sessão não estiver pronta, evita mismatch
  if (!ready) {
    return (
      <main className="p-6">
        <div className="animate-pulse text-sm text-gray-600">Preparando sessão…</div>
      </main>
    );
  }

  // Evita flicker no professor
  if (session?.role === "professor") {
    return (
      <main className="p-6 text-sm text-gray-600">
        Redirecionando para sua agenda…
      </main>
    );
  }

  const saldoDoMes = Number(kpisFin.paid || 0) - Number(kpisExp.paid || 0);


  // ---- envio de email (geral) ----
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

      await sendMail({
        to,
        subject,
        html: `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;line-height:1.5;">
                 ${message.replace(/\n/g, "<br/>")}
               </div>`,
      });

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
    {/* ⬇️ novo seletor de conjunto de cards */}
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
           <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
{panelGroup === "receitas" && (
  <>
    <Kpi title="Receita total prevista" value={maskMoney(kpisFin.billed)} />
    <Kpi title="Receita recebida" value={maskMoney(kpisFin.paid)} />
    <Kpi title="Receita em atraso" value={maskMoney(kpisFin.overdueMoney)} />
  </>
)}

{panelGroup === "gastos" && (
  <>
    <Kpi title="Gastos totais" value={maskMoney(kpisExp.total)} />
    <Kpi title="Gastos pagos" value={maskMoney(kpisExp.paid)} />
    <Kpi title="Gastos em atraso" value={maskMoney(kpisExp.overdue)} />
  </>
)}

{panelGroup === "custos" && (
  <>
    <Kpi title="Custo professores" value={maskMoney(kpisExp.teachers || 0)} />
    {/* futuramente: outros custos filtrados por cost_center */}
  </>
)}

    {/* Card fixo */}
    <Kpi title="Alunos ativos" value={maskCount(counts.studentsActive)} />
  </section>
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

function Kpi({ title, value }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

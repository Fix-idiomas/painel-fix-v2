"use client";

import { useEffect, useMemo, useState } from "react";
import PreviewShell from "../_components/PreviewShell";
import { financeGateway } from "@/lib/financeGateway";
import {
  BarChart3,
  PieChart,
  TrendingUp,
  Users,
  BookOpen,
  DollarSign,
  Download,
  Calendar,
  Loader2,
} from "lucide-react";

const REPORTS = [
  { key: "receita",       title: "Receita por mês",       desc: "Evolução da receita bruta e líquida",  icon: DollarSign, accent: "var(--p-primary)" },
  { key: "alunos",        title: "Alunos por status",     desc: "Distribuição da base ativa",           icon: Users,      accent: "#0F766E" },
  { key: "turmas",        title: "Ocupação das turmas",   desc: "Vagas preenchidas vs. capacidade",     icon: BookOpen,   accent: "#7C3AED" },
  { key: "gastos",        title: "Gastos por categoria",  desc: "Quebra das despesas mensais",          icon: PieChart,   accent: "#E94F37" },
  { key: "inadimplencia", title: "Inadimplência",         desc: "Histórico de atrasos e recuperação",   icon: TrendingUp, accent: "#DC2626" },
  { key: "aulas",         title: "Aulas por professor",   desc: "Horas ministradas e repasses",         icon: BarChart3,  accent: "#1E40AF" },
];

const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function money(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function addMonthsToYm(ym, offset) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function ymLabel(ym) {
  const [, m] = ym.split("-").map(Number);
  return MONTH_ABBR[(m - 1 + 12) % 12];
}
function periodMonths(key) {
  if (key === "1m") return 1;
  if (key === "3m") return 3;
  if (key === "12m") return 12;
  if (key === "ytd") {
    return new Date().getMonth() + 1;
  }
  return 6;
}

export default function RelatoriosPreview() {
  const [period, setPeriod] = useState("6m");
  const [data, setData] = useState([]); // [{ ym, gross, net, paid, expenses }]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const n = periodMonths(period);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const currYm = currentYm();
        const yms = [];
        for (let i = n - 1; i >= 0; i--) yms.push(addMonthsToYm(currYm, -i));
        const results = await Promise.all(
          yms.map((ym) =>
            Promise.all([
              financeGateway.getCombinedRevenueKpis({ ym }),
              financeGateway.listExpenseEntries({ ym }),
            ])
          )
        );
        if (cancelled) return;
        const out = yms.map((ym, idx) => {
          const [kpis, exp] = results[idx];
          const recebido = Number(kpis?.recebido || 0);
          const aReceber = Number(kpis?.a_receber || 0);
          const atrasado = Number(kpis?.atrasado || 0);
          const expPaid = Number(exp?.kpis?.paid || 0);
          const gross = recebido + aReceber + atrasado;
          const net = recebido - expPaid;
          return { ym, gross, net, recebido, expenses: expPaid };
        });
        setData(out);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [n]);

  const summary = useMemo(() => {
    if (data.length === 0) return { avg: 0, growth6m: null, projected: 0 };
    const sum = data.reduce((a, x) => a + x.gross, 0);
    const avg = sum / data.length;
    const first = data[0]?.gross || 0;
    const last = data[data.length - 1]?.gross || 0;
    const growth = first > 0 ? ((last - first) / first) * 100 : null;
    // simple next-month projection: linear trend from last two
    let projected = last;
    if (data.length >= 2) {
      const prev = data[data.length - 2].gross;
      const delta = last - prev;
      projected = Math.max(0, last + delta);
    }
    return { avg, growth6m: growth, projected };
  }, [data]);

  const max = Math.max(1, ...data.map((x) => x.gross));

  return (
    <PreviewShell
      active="relatorios"
      crumb="Análise"
      title="Relatórios"
      rightAction={
        <button className="p-btn p-btn-ghost hidden sm:inline-flex">
          <Download className="h-4 w-4" />
          <span>Exportar</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Relatórios</h1>
            <p className="mt-1 text-sm text-[var(--p-text-muted)]">
              Visão geral da operação · últimos {n} {n === 1 ? "mês" : "meses"}
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] p-1 text-xs">
            {[
              { k: "1m", l: "1M" },
              { k: "3m", l: "3M" },
              { k: "6m", l: "6M" },
              { k: "12m", l: "12M" },
              { k: "ytd", l: "YTD" },
            ].map((p) => {
              const active = period === p.k;
              return (
                <button
                  key={p.k}
                  onClick={() => setPeriod(p.k)}
                  className={[
                    "rounded-md px-3 py-1 transition-colors",
                    active ? "bg-[var(--p-primary)] text-white" : "text-[var(--p-text-muted)] hover:text-[var(--p-text)]",
                  ].join(" ")}
                >
                  {p.l}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
            Erro ao carregar relatórios: {error}
          </div>
        )}

        <div className="p-card mb-8 p-5 md:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-[var(--p-text-faint)]">Destaque</div>
              <div className="mt-0.5 text-base font-semibold">Receita por mês</div>
              <div className="text-xs text-[var(--p-text-muted)]">Bruta vs. líquida</div>
            </div>
            <div className="inline-flex items-center gap-3 text-xs text-[var(--p-text-muted)]">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--p-primary)" }} /> Bruta</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--p-accent)" }} /> Líquida</span>
            </div>
          </div>

          {loading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-sm text-[var(--p-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : data.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm text-[var(--p-text-muted)]">
              Sem dados no período.
            </div>
          ) : (
            <div className="flex items-end gap-3 md:gap-6 h-48">
              {data.map((m) => {
                const gH = (m.gross / max) * 100;
                const nH = (Math.max(0, m.net) / max) * 100;
                return (
                  <div key={m.ym} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="relative flex h-full w-full items-end gap-1">
                      <div className="flex-1 rounded-md" style={{ height: `${gH}%`, background: "var(--p-primary)" }} title={`Bruta ${money(m.gross)}`} />
                      <div className="flex-1 rounded-md" style={{ height: `${nH}%`, background: "var(--p-accent)" }} title={`Líquida ${money(m.net)}`} />
                    </div>
                    <div className="text-[11px] text-[var(--p-text-muted)]">{ymLabel(m.ym)}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[var(--p-border)] pt-4">
            <div>
              <div className="text-xs text-[var(--p-text-muted)]">Média mensal</div>
              <div className="p-kpi-value text-lg">{loading ? "…" : money(summary.avg)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--p-text-muted)]">Crescimento {n}m</div>
              <div className={`p-kpi-value text-lg ${summary.growth6m !== null && summary.growth6m >= 0 ? "text-[var(--p-success)]" : summary.growth6m !== null ? "text-[var(--p-danger)]" : ""}`}>
                {loading ? "…" : summary.growth6m === null ? "—" : `${summary.growth6m >= 0 ? "+" : ""}${summary.growth6m.toFixed(1).replace(".", ",")}%`}
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--p-text-muted)]">Projeção próximo mês</div>
              <div className="p-kpi-value text-lg">{loading ? "…" : money(summary.projected)}</div>
            </div>
          </div>
        </div>

        <h2 className="mb-3 text-sm font-semibold text-[var(--p-text-muted)]">Todos os relatórios</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.key}
                className="p-card p-card-hover flex flex-col items-start gap-3 p-5 text-left"
              >
                <div
                  className="grid h-10 w-10 place-items-center rounded-lg text-white"
                  style={{ background: r.accent }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{r.title}</div>
                  <div className="mt-0.5 text-xs text-[var(--p-text-muted)]">{r.desc}</div>
                </div>
                <div className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-[var(--p-primary)]">
                  <Calendar className="h-3 w-3" /> Abrir
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </PreviewShell>
  );
}

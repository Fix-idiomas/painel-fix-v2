"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { financeGateway } from "@/lib/financeGateway";
import { readCombinedRevenue } from "@/lib/revenueKpis";
import {
  BarChart3,
  PieChart,
  TrendingUp,
  Users,
  BookOpen,
  DollarSign,
  Download,
  Calendar,
  ClipboardCheck,
  Loader2,
  ArrowRight,
} from "lucide-react";

// ─── Catálogo de relatórios ──────────────────────────────────────
// `href` presente = relatório real disponível.
// `href` ausente  = card "em breve" (estilo desabilitado).
const REPORTS = [
  {
    key: "assiduidade",
    title: "Assiduidade",
    desc: "Presenças, ausências e % de assiduidade por turma e mês.",
    icon: ClipboardCheck,
    accent: "#0F766E",
    href: "/relatorios/assiduidade",
  },
  {
    key: "inadimplencia",
    title: "Inadimplência",
    desc: "Mensalidades pendentes e vencidas, por aluno/pagador.",
    icon: TrendingUp,
    accent: "#DC2626",
    href: "/relatorios/inadimplencia",
  },
  {
    key: "receita",
    title: "Receita por mês",
    desc: "Evolução da receita bruta e líquida.",
    icon: DollarSign,
    accent: "var(--p-primary)",
    // sem href: já está renderizado no destaque acima
  },
  {
    key: "alunos",
    title: "Alunos por status",
    desc: "Distribuição da base ativa.",
    icon: Users,
    accent: "#1E40AF",
  },
  {
    key: "turmas",
    title: "Ocupação das turmas",
    desc: "Vagas preenchidas vs. capacidade.",
    icon: BookOpen,
    accent: "#7C3AED",
  },
  {
    key: "gastos",
    title: "Gastos por categoria",
    desc: "Quebra das despesas mensais.",
    icon: PieChart,
    accent: "#E94F37",
  },
  {
    key: "aulas",
    title: "Aulas por professor",
    desc: "Horas ministradas e repasses.",
    icon: BarChart3,
    accent: "#0891B2",
  },
];

const MONTH_ABBR = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function money(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
// Valor compacto p/ rótulo em cima da barra (ex.: "R$ 13k"): mantém o gráfico
// legível sem depender só do tooltip (hover não existe no mobile).
function abbrevMoney(v) {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}R$ ${k.toFixed(abs >= 10000 ? 0 : 1).replace(".", ",")}k`;
  }
  return `${sign}R$ ${abs.toFixed(0)}`;
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
  if (key === "ytd") return new Date().getMonth() + 1;
  return 6;
}

export default function RelatoriosHubPage() {
  const [period, setPeriod] = useState("6m");
  const [data, setData] = useState([]); // [{ ym, gross, net, recebido, expenses }]
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

        // Repasse de professores é custo (o /painel já trata assim). Buscamos a
        // lista de professores uma vez e somamos o repasse por mês, para a
        // "Líquida" não superestimar o lucro. Sem permissão/erro → 0 (graceful).
        const teachers = await financeGateway.listTeachers().catch(() => []);
        const teacherIds = (teachers || []).map((t) => t.id).filter(Boolean);
        const sumPayouts = async (ym) => {
          if (!teacherIds.length) return 0;
          const parts = await Promise.all(
            teacherIds.map((id) =>
              financeGateway.sumTeacherPayoutByMonth(id, ym).catch(() => ({ amount: 0 }))
            )
          );
          return parts.reduce((a, p) => a + Number(p?.amount || 0), 0);
        };

        const results = await Promise.all(
          yms.map((ym) =>
            Promise.all([
              financeGateway.getCombinedRevenueKpis({ ym }),
              financeGateway.listExpenseEntries({ ym }),
              sumPayouts(ym),
            ])
          )
        );
        if (cancelled) return;
        const out = yms.map((ym, idx) => {
          const [kpis, exp, professores] = results[idx];
          // Leitura única via helper (chaves em inglês da fonte). Sem isso, gross
          // ficava 0 e o gráfico vinha vazio.
          const { recebido, gross } = readCombinedRevenue(kpis);
          const expPaid = Number(exp?.kpis?.paid || 0);
          const prof = Number(professores || 0);
          // Líquida = recebido − despesas pagas − repasse de professores.
          const net = recebido - expPaid - prof;
          return { ym, gross, net, recebido, expenses: expPaid, professores: prof };
        });
        setData(out);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [n]);

  const summary = useMemo(() => {
    if (data.length === 0) return { avg: 0, growth: null, projected: 0 };
    const sum = data.reduce((a, x) => a + x.gross, 0);
    const avg = sum / data.length;
    const first = data[0]?.gross || 0;
    const last = data[data.length - 1]?.gross || 0;
    const growth = first > 0 ? ((last - first) / first) * 100 : null;
    let projected = last;
    if (data.length >= 2) {
      const prev = data[data.length - 2].gross;
      const delta = last - prev;
      projected = Math.max(0, last + delta);
    }
    return { avg, growth, projected };
  }, [data]);

  const max = Math.max(1, ...data.map((x) => x.gross));
  const currYmVal = currentYm();
  // Rótulo com ano quando o período cruza anos (12M/YTD) — senão "Jan" é ambíguo.
  const multiYear = new Set(data.map((d) => d.ym.slice(0, 4))).size > 1;
  const hasCurrentPartial = data.some((d) => d.ym === currYmVal);

  function handleExport() {
    if (data.length === 0) return;
    const rows = [
      ["Mes", "Bruta", "Recebido", "Liquida", "Despesas", "Professores"],
      ...data.map((m) => [
        m.ym,
        m.gross.toFixed(2),
        m.recebido.toFixed(2),
        m.net.toFixed(2),
        m.expenses.toFixed(2),
        Number(m.professores || 0).toFixed(2),
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const bom = "﻿";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-receita-${currentYm()}-${n}m.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Relatórios</h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            Visão geral da operação · últimos {n} {n === 1 ? "mês" : "meses"}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
                    active
                      ? "bg-[var(--p-primary)] text-white"
                      : "text-[var(--p-text-muted)] hover:text-[var(--p-text)]",
                  ].join(" ")}
                >
                  {p.l}
                </button>
              );
            })}
          </div>
          <button
            className="p-btn p-btn-ghost"
            onClick={handleExport}
            disabled={loading || data.length === 0}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          Erro ao carregar relatórios: {error}
        </div>
      )}

      {/* Destaque: gráfico de receita */}
      <div className="p-card p-5 md:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--p-text-faint)]">
              Destaque
            </div>
            <div className="mt-0.5 text-base font-semibold">Receita por mês</div>
            <div className="text-xs text-[var(--p-text-muted)]">Bruta vs. líquida</div>
          </div>
          <div className="inline-flex items-center gap-3 text-xs text-[var(--p-text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: "var(--p-primary)" }}
              />{" "}
              Bruta
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: "var(--p-accent)" }}
              />{" "}
              Líquida
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ background: "var(--p-danger)" }}
              />{" "}
              Prejuízo
            </span>
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
          <div
            className="flex items-end gap-3 md:gap-6 h-48"
            role="img"
            aria-label={`Receita bruta e líquida por mês, ${data.length} ${
              data.length === 1 ? "mês" : "meses"
            }.`}
          >
            {data.map((m) => {
              const gH = (m.gross / max) * 100;
              const loss = m.net < 0;
              // Prejuízo (líquida negativa): usa o módulo p/ dar altura visível e
              // cor de alerta — senão a barra sumia e o mês parecia "sem dados".
              const nH = (Math.min(Math.abs(m.net), max) / max) * 100;
              const nHeight = loss ? Math.max(2, nH) : nH;
              const isCurrent = m.ym === currYmVal;
              const label = `${ymLabel(m.ym)}${multiYear ? "/" + m.ym.slice(2, 4) : ""}`;
              return (
                <div
                  key={m.ym}
                  className={`flex flex-1 flex-col items-center gap-1.5 ${
                    isCurrent ? "opacity-60" : ""
                  }`}
                  aria-label={`${label}${isCurrent ? " (mês em curso, parcial)" : ""}: bruta ${money(
                    m.gross
                  )}, ${loss ? "prejuízo " : "líquida "}${money(m.net)}`}
                >
                  <div className="relative flex h-full w-full items-end gap-1">
                    <div
                      className="flex-1 rounded-md"
                      style={{ height: `${gH}%`, background: "var(--p-primary)" }}
                      title={`Bruta ${money(m.gross)}`}
                    />
                    <div
                      className="flex-1 rounded-md"
                      style={{
                        height: `${nHeight}%`,
                        background: loss ? "var(--p-danger)" : "var(--p-accent)",
                      }}
                      title={`${loss ? "Líquida (prejuízo) " : "Líquida "}${money(m.net)}`}
                    />
                  </div>
                  <div className="text-[11px] text-[var(--p-text-muted)]">
                    {label}
                    {isCurrent ? " *" : ""}
                  </div>
                  <div className="text-[10px] font-medium tabular-nums text-[var(--p-text)]">
                    {abbrevMoney(m.gross)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!loading && hasCurrentPartial && (
          <div className="mt-2 text-[11px] text-[var(--p-text-faint)]">
            * mês em curso (parcial) — os valores ainda podem mudar.
          </div>
        )}

        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[var(--p-border)] pt-4">
          <div>
            <div className="text-xs text-[var(--p-text-muted)]">Média mensal</div>
            <div className="p-kpi-value text-lg">
              {loading ? "…" : money(summary.avg)}
            </div>
          </div>
          <div>
            <div
              className="text-xs text-[var(--p-text-muted)]"
              title="Compara a receita bruta do primeiro mês do período com a do último mês (que pode estar parcial)."
            >
              Crescimento {n}m
            </div>
            <div
              className={`p-kpi-value text-lg ${
                summary.growth !== null && summary.growth >= 0
                  ? "text-[var(--p-success)]"
                  : summary.growth !== null
                  ? "text-[var(--p-danger)]"
                  : ""
              }`}
            >
              {loading
                ? "…"
                : summary.growth === null
                ? "—"
                : `${summary.growth >= 0 ? "+" : ""}${summary.growth
                    .toFixed(1)
                    .replace(".", ",")}%`}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--p-text-muted)]">Projeção próximo mês</div>
            <div className="p-kpi-value text-lg">
              {loading ? "…" : money(summary.projected)}
            </div>
          </div>
        </div>
      </div>

      {/* Grid de relatórios */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-[var(--p-text-muted)]">
          Todos os relatórios
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            const cardClasses =
              "p-card flex flex-col items-start gap-3 p-5 text-left transition-shadow";
            const inner = (
              <>
                <div
                  className="grid h-10 w-10 place-items-center rounded-lg text-white"
                  style={{ background: r.accent }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{r.title}</div>
                  <div className="mt-0.5 text-xs text-[var(--p-text-muted)]">
                    {r.desc}
                  </div>
                </div>
                <div
                  className={`mt-auto inline-flex items-center gap-1.5 text-xs font-medium ${
                    r.href ? "text-[var(--p-primary)]" : "text-[var(--p-text-faint)]"
                  }`}
                >
                  {r.href ? (
                    <>
                      <ArrowRight className="h-3 w-3" /> Abrir
                    </>
                  ) : (
                    <>
                      <Calendar className="h-3 w-3" /> Em breve
                    </>
                  )}
                </div>
              </>
            );

            if (r.href) {
              return (
                <Link key={r.key} href={r.href} className={`${cardClasses} p-card-hover`}>
                  {inner}
                </Link>
              );
            }
            return (
              <div key={r.key} className={`${cardClasses} opacity-70`}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

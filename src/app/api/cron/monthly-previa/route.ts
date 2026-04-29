import { NextResponse, type NextRequest } from "next/server";
import { financeGateway } from "@/lib/financeGateway";

/**
 * Cron mensal (configurado no vercel.json) executado todo dia 01 para gerar
 * a prévia automaticamente: mensalidades, despesas recorrentes e outras
 * receitas recorrentes do mês corrente. Reaproveita a mesma lógica do botão
 * "Prévia" da tela Financeiro (PreviewMonthModal).
 *
 * Proteção: requer header `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const ym = new Date().toISOString().slice(0, 7);

    const [mensResult, expensesResult, otherRevenuesResult] = await Promise.allSettled([
      financeGateway.generateMonth({ ym }),
      financeGateway.generateExpenses({ ym }),
      financeGateway.ensureOtherRevenuesForMonth(ym),
    ]);

    const summary = {
      ym,
      mensalidades: summarize(mensResult),
      gastos: summarize(expensesResult),
      outras_receitas: summarize(otherRevenuesResult),
    };

    const anyFailed = [mensResult, expensesResult, otherRevenuesResult].some(
      (r) => r.status === "rejected"
    );

    return NextResponse.json(
      { ok: !anyFailed, ...summary },
      { status: anyFailed ? 207 : 200 }
    );
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

function summarize(r: PromiseSettledResult<unknown>) {
  if (r.status === "fulfilled") {
    const v = r.value as unknown;
    if (Array.isArray(v)) return { ok: true, count: v.length };
    return { ok: true, value: v ?? null };
  }
  return { ok: false, error: String((r as PromiseRejectedResult).reason) };
}

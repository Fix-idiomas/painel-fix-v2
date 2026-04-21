import { NextResponse, type NextRequest } from "next/server";
import { financeGateway } from "@/lib/financeGateway";
import { sendMailgun } from "@/lib/mailgun";

/**
 * Cron diário (configurado no vercel.json) para enviar lembretes de mensalidades em atraso.
 * - Agrupa por pagador (um e-mail por pessoa)
 * - Monta tabela HTML com os títulos em atraso
 * - Chama Mailgun diretamente via helper (não faz HTTP para /api/send-mail)
 *
 * Proteção: requer header `Authorization: Bearer ${CRON_SECRET}`.
 * A Vercel envia automaticamente esse header para rotas listadas em vercel.json/crons.
 */

type PaymentRow = {
  payer_id: string;
  student_name: string;
  due_date: string;
  amount: number | string;
  days_overdue: number | string;
};

type Payer = { id: string; name?: string; email?: string };

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const ym = new Date().toISOString().slice(0, 7);

    // 1) Buscar lançamentos do mês pendentes
    const { rows } = (await financeGateway.listPayments({ ym, status: "pending" })) as { rows: PaymentRow[] };

    // 2) Filtrar os que estão em atraso (days_overdue > 0)
    const overdue = rows.filter((r) => Number(r.days_overdue || 0) > 0);
    if (overdue.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, msg: "Sem pendências em atraso." });
    }

    // 3) Payers do sistema → para mapear payer_id → email
    const payers = (await financeGateway.listPayers()) as Payer[];
    const payerById = new Map<string, Payer>(payers.map((p) => [p.id, p]));

    // 4) Agrupar por pagador (só envia para quem tiver email definido)
    const groups = new Map<string, PaymentRow[]>();
    for (const r of overdue) {
      const py = payerById.get(r.payer_id);
      const email = py?.email?.trim();
      if (!email) continue;

      if (!groups.has(r.payer_id)) groups.set(r.payer_id, []);
      groups.get(r.payer_id)!.push(r);
    }

    if (groups.size === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        msg: "Existem pendências, mas nenhum pagador com e-mail cadastrado.",
      });
    }

    // 5) Enviar um e-mail por pagador com a lista de pendências
    const results: Array<{ to: string; ok: boolean; status: number; detail: string | null }> = [];

    for (const [payer_id, items] of groups.entries()) {
      const payer = payerById.get(payer_id)!;
      const to = payer.email!;
      const payerName = payer.name || "Responsável";

      const tableRows = items
        .map(
          (r) => `
          <tr>
            <td style="padding:6px 8px;border:1px solid #eee">${r.student_name}</td>
            <td style="padding:6px 8px;border:1px solid #eee">${new Date(
              r.due_date + "T00:00:00"
            ).toLocaleDateString("pt-BR")}</td>
            <td style="padding:6px 8px;border:1px solid #eee">R$ ${Number(r.amount)
              .toFixed(2)
              .replace(".", ",")}</td>
            <td style="padding:6px 8px;border:1px solid #eee">${r.days_overdue} dia(s)</td>
          </tr>`
        )
        .join("");

      const subject = "Lembrete: mensalidade(s) em atraso";
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#1f2937;">
          <p>Olá ${payerName},</p>
          <p>Identificamos mensalidade(s) em atraso referente(s) ao mês ${ym}:</p>
          <table style="border-collapse:collapse; width:100%; max-width:640px; margin:12px 0;">
            <thead>
              <tr style="background:#f8fafc">
                <th style="text-align:left;padding:6px 8px;border:1px solid #eee">Aluno</th>
                <th style="text-align:left;padding:6px 8px;border:1px solid #eee">Vencimento</th>
                <th style="text-align:left;padding:6px 8px;border:1px solid #eee">Valor</th>
                <th style="text-align:left;padding:6px 8px;border:1px solid #eee">Atraso</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <p>Se já realizou o pagamento, por favor, desconsidere este lembrete.</p>
          <p>Qualquer dúvida, estamos à disposição.</p>
          <p>Atenciosamente,<br/><b>Fix Idiomas</b></p>
        </div>
      `;

      const r = await sendMailgun({ to, subject, html });
      results.push({
        to,
        ok: r.ok,
        status: r.ok ? 200 : (r.status ?? 500),
        detail: r.ok ? null : (r.error ?? null),
      });
    }

    const sent = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, sent, results });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { financeGateway } from "@/lib/financeGateway";

/**
 * Cron diário (configurado no vercel.json) para enviar lembretes de mensalidades em atraso.
 * - Agrupa por pagador (um e-mail por pessoa)
 * - Monta tabela HTML com os títulos em atraso
 * - Usa /api/send-mail para enviar
 *
 * Teste local: GET http://localhost:3000/api/cron/dunning-reminders
 */

export async function GET() {
  try {
    const ym = new Date().toISOString().slice(0, 7);

    // 1) Buscar lançamentos do mês pendentes
    const { rows } = await financeGateway.listPayments({ ym, status: "pending" });

    // 2) Filtrar os que estão em atraso (days_overdue > 0)
    const overdue = rows.filter((r) => Number(r.days_overdue || 0) > 0);
    if (overdue.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, msg: "Sem pendências em atraso." });
    }

    // 3) Payers do sistema (mock) → para mapear payer_id → email
    const payers = await financeGateway.listPayers();
    const payerById = new Map(payers.map((p) => [p.id, p]));

    // 4) Agrupar por pagador (só envia para quem tiver email definido)
    const groups = new Map(); // payer_id -> array de rows
    for (const r of overdue) {
      const py = payerById.get(r.payer_id);
      const email = py?.email?.trim();
      if (!email) continue; // sem e-mail não envia

      if (!groups.has(r.payer_id)) groups.set(r.payer_id, []);
      groups.get(r.payer_id).push(r);
    }

    if (groups.size === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        msg: "Existem pendências, mas nenhum pagador com e-mail cadastrado.",
      });
    }

    // 5) Enviar um e-mail por pagador com a lista de pendências
    const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const results = [];

    for (const [payer_id, items] of groups.entries()) {
      const payer = payerById.get(payer_id);
      const to = payer.email;
      const payerName = payer.name || "Responsável";

      // Monta uma tabelinha HTML com as pendências
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

      const resp = await fetch(`${base}/api/send-mail`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, html }),
      });

      const json = await resp.json().catch(() => ({}));
      results.push({ to, ok: resp.ok, status: resp.status, json });
    }

    const sent = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, sent, results });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

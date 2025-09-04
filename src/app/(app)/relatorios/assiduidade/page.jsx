"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { financeGateway } from "@/lib/financeGateway";

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const ymNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function AssiduidadePage() {
  const search = useSearchParams();
  const router = useRouter();

  const [turmas, setTurmas] = useState([]);
  const [ym, setYm] = useState(search.get("ym") || ymNow());
  const [turmaId, setTurmaId] = useState(search.get("turma") || "all");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // carrega turmas 1x
  useEffect(() => {
    financeGateway.listTurmas().then(setTurmas);
  }, []);

  // sempre que mudar filtro, atualiza querystring e recarrega
  useEffect(() => {
    const params = new URLSearchParams();
    if (ym) params.set("ym", ym);
    if (turmaId && turmaId !== "all") params.set("turma", turmaId);
    router.replace(`/relatorios/assiduidade?${params.toString()}`);
    buildReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym, turmaId]);

  async function buildReport() {
    setLoading(true);
    try {
      const ts = turmaId === "all" ? await financeGateway.listTurmas() : (await financeGateway.listTurmas()).filter(t => t.id === turmaId);

      const all = [];
      for (const t of ts) {
        const turmaRows = await reportForTurma(t, ym);
        all.push(...turmaRows);
      }
      setRows(all);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-end gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Relatório de assiduidade</h1>

        <div>
          <label className="block text-xs mb-1 text-slate-600">Mês</label>
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            className="border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-xs mb-1 text-slate-600">Turma</label>
          <select
            value={turmaId}
            onChange={(e) => setTurmaId(e.target.value)}
            className="border rounded px-3 py-2 min-w-[220px]"
          >
            <option value="all">Todas as turmas</option>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <button onClick={() => exportCSV(rows, ym, turmaId)} className="border rounded px-3 py-2">
          Exportar CSV
        </button>
      </div>

      {loading ? (
        <div className="p-4">Carregando…</div>
      ) : rows.length === 0 ? (
        <div className="p-4 border rounded">Sem registros para este filtro.</div>
      ) : (
        <GroupedTable rows={rows} />
      )}
    </main>
  );
}

/* ---------- Cálculo do relatório (independente do gateway ter helpers) ---------- */
async function reportForTurma(turma, ym) {
  const ymKey = (ym || "").slice(0, 7);

  // sessões do mês da turma
  const sessions = (await financeGateway.listSessions(turma.id)).filter(
    (s) => (s.date || "").slice(0, 7) === ymKey
  );

  // membros atuais (apenas para exibir nomes mesmo que não tenham frequência no mês)
  const members = await financeGateway.listTurmaMembers(turma.id);

  const map = new Map(); // student_id -> { presents, absents, name }
  for (const m of members) {
    map.set(m.id, { name: m.name, presents: 0, absents: 0 });
  }

  // percorre as presenças/ausências registradas em cada sessão
  const allAtt = await Promise.all(sessions.map((s) => financeGateway.listAttendance(s.id)));
  for (const list of allAtt) {
    for (const a of list) {
      const e = map.get(a.student_id) || { name: a.student_name_snapshot || "(Aluno)", presents: 0, absents: 0 };
      if (a.present === true) e.presents += 1;
      else if (a.present === false) e.absents += 1;
      map.set(a.student_id, e);
    }
  }

  // transforma em linhas
  const out = [];
  for (const [student_id, v] of map.entries()) {
    const total = v.presents + v.absents;
    const rate = total > 0 ? v.presents / total : 0;
    out.push({
      turma_id: turma.id,
      turma_name: turma.name,
      student_id,
      student_name: v.name,
      presents: v.presents,
      absents: v.absents,
      total,
      rate,
    });
  }
  return out;
}

/* ---------- Tabela agrupada por turma ---------- */
function GroupedTable({ rows }) {
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (!m.has(r.turma_id)) m.set(r.turma_id, { name: r.turma_name, items: [] });
      m.get(r.turma_id).items.push(r);
    }
    return [...m.entries()].sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""));
  }, [rows]);

  return (
    <>
      {groups.map(([tid, g]) => (
        <section key={tid} className="border rounded overflow-auto mb-6">
          <div className="px-3 py-2 text-sm bg-gray-50 font-medium">
            {g.name}
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Aluno</Th>
                <Th className="text-right">Presenças</Th>
                <Th className="text-right">Ausências</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">% Assiduidade</Th>
              </tr>
            </thead>
            <tbody>
              {g.items
                .sort((a, b) => a.student_name.localeCompare(b.student_name))
                .map((r) => (
                  <tr key={r.student_id} className="border-t">
                    <Td>{r.student_name}</Td>
                    <Td className="text-right">{r.presents}</Td>
                    <Td className="text-right">{r.absents}</Td>
                    <Td className="text-right">{r.total}</Td>
                    <Td className="text-right">{pct(r.rate)}</Td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  );
}

/* ---------- util ---------- */
function exportCSV(rows, ym, turmaId) {
  const header = ["Turma", "Aluno", "Presenças", "Ausências", "Total", "Assiduidade (%)"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      csvCell(r.turma_name),
      csvCell(r.student_name),
      r.presents,
      r.absents,
      r.total,
      (r.rate * 100).toFixed(1).replace(".", ","),
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `assiduidade_${ym}${turmaId === "all" ? "" : `_${turmaId}`}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function csvCell(s) {
  const v = (s ?? "").toString();
  return /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
function Th({ children, className = "" }) {
  return <th className={`text-left px-3 py-2 font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { financeGateway } from "@/lib/financeGateway";

const fmtBR = (s) => {
  if (!s) return "—";
  const str = String(s).trim();
  const onlyDate = /^\d{4}-\d{2}-\d{2}$/.test(str);
  const safe = onlyDate ? `${str}T00:00:00` : str.slice(0, 25);
  const d = new Date(safe);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

export default function AlunoEvolucaoPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [student, setStudent] = useState(null);
  const [rows, setRows] = useState([]);

  async function load() {
    const students = await financeGateway.listStudents();
    const s = students.find((x) => x.id === studentId);
    if (!s) {
      alert("Aluno não encontrado");
      router.push("/alunos");
      return;
    }
    setStudent(s);

    const att = await financeGateway.listAttendanceByStudent(studentId);
    setRows(att);
  }

  useEffect(() => { if (studentId) load(); }, [studentId]);

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Evolução — {student?.name ?? ""}</h1>
          <div className="text-slate-600">Status: <b>{student?.status}</b></div>
        </div>
        <div className="flex gap-2">
          <Link href="/alunos" className="border rounded px-3 py-2">Voltar</Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-4 border rounded">Nenhum registro encontrado.</div>
      ) : (
        <section className="border rounded overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>Data</Th>
                <Th>Turma</Th>
                <Th>Presença</Th>
                <Th>Observação</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.id ?? (r.session_id && r.student_id ? `${r.session_id}:${r.student_id}` : `row-${idx}`)} className="border-t">
                  <Td>{fmtBR(r.session_date_snapshot)}</Td>
                  <Td>{r.turma_name_snapshot || "—"}</Td>
                  <Td>{r.present ? "Presente" : "Ausente"}</Td>
                  <Td>{r.note || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

function Th({ children }) { return <th className="text-left px-3 py-2 font-medium">{children}</th>; }
function Td({ children }) { return <td className="px-3 py-2">{children}</td>; }
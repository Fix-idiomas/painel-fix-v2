"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { financeGateway } from "@/lib/financeGateway";
import AvatarAluno from "@/components/AvatarAluno";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Calendar,
  BookOpen,
  TrendingUp,
  Users,
  Loader2,
  PauseCircle,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────
function fmtBR(s) {
  if (!s) return "—";
  const str = String(s).trim();
  const onlyDate = /^\d{4}-\d{2}-\d{2}$/.test(str);
  const safe = onlyDate ? `${str}T00:00:00` : str.slice(0, 25);
  const d = new Date(safe);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

function fmtBR_long(s) {
  if (!s) return "—";
  const str = String(s).trim();
  const onlyDate = /^\d{4}-\d{2}-\d{2}$/.test(str);
  const safe = onlyDate ? `${str}T00:00:00` : str.slice(0, 25);
  const d = new Date(safe);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusChip(status) {
  if (status === "ativo")
    return { cls: "p-chip-success", icon: CheckCircle2, label: "Ativo" };
  return { cls: "p-chip-neutral", icon: PauseCircle, label: "Inativo" };
}

// ─── Página ──────────────────────────────────────────────────────
export default function AlunoEvolucaoPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [student, setStudent] = useState(null);
  const [rows, setRows] = useState([]);
  const [signedPhotoUrl, setSignedPhotoUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [turmaFilter, setTurmaFilter] = useState("all");

  async function load() {
    try {
      setLoading(true);
      setError(null);

      const students = await financeGateway.listStudents();
      const s = students.find((x) => x.id === studentId);
      if (!s) {
        setError("Aluno não encontrado.");
        return;
      }
      setStudent(s);

      // Signed URL da foto (se houver)
      const photoPath = String(s.photo_url || "").trim();
      if (photoPath) {
        try {
          const { data, error: photoErr } = await supabase.storage
            .from("student-photos")
            .createSignedUrl(photoPath, 600);
          if (!photoErr) setSignedPhotoUrl(data?.signedUrl || null);
        } catch {
          /* sem foto, sem problemas */
        }
      }

      const att = await financeGateway.listAttendanceByStudent(studentId);
      setRows(Array.isArray(att) ? att : []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (studentId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  // Lista única de turmas para o filtro
  const turmas = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const name = r.turma_name_snapshot || "—";
      if (!map.has(name)) map.set(name, 0);
      map.set(name, map.get(name) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [rows]);

  // Filtrar por turma
  const filtered = useMemo(() => {
    if (turmaFilter === "all") return rows;
    return rows.filter(
      (r) => (r.turma_name_snapshot || "—") === turmaFilter
    );
  }, [rows, turmaFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = filtered.length;
    const presentes = filtered.filter((r) => r.present).length;
    const ausentes = total - presentes;
    const pct = total > 0 ? Math.round((presentes / total) * 100) : 0;
    return { total, presentes, ausentes, pct };
  }, [filtered]);

  // Ordenar por data desc
  const sortedRows = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = String(a.session_date_snapshot || "");
      const db = String(b.session_date_snapshot || "");
      return db.localeCompare(da);
    });
  }, [filtered]);

  // ─── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--p-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando evolução…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <Link
          href="/alunos"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--p-text-muted)] hover:text-[var(--p-text)]"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para alunos
        </Link>
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          {error}
        </div>
      </div>
    );
  }

  if (!student) return null;

  const { cls, icon: StatusIcon, label: statusLabel } = statusChip(student.status);
  const pctTone =
    stats.pct >= 80
      ? "text-[var(--p-success)]"
      : stats.pct >= 50
      ? "text-[var(--p-warning)]"
      : "text-[var(--p-danger)]";

  return (
    <div className="space-y-6">
      {/* Voltar */}
      <Link
        href="/alunos"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--p-text-muted)] hover:text-[var(--p-text)]"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para alunos
      </Link>

      {/* Header do aluno */}
      <div className="p-card p-5 md:p-6">
        <div className="flex items-start gap-4">
          <AvatarAluno
            student={student}
            imageUrl={signedPhotoUrl || undefined}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--p-text-faint)]">
              Evolução
            </div>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight truncate md:text-3xl">
              {student.name || "—"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={`p-chip ${cls}`}>
                <StatusIcon className="h-3 w-3" /> {statusLabel}
              </span>
              {student.email && (
                <span className="p-chip p-chip-neutral">{student.email}</span>
              )}
              {student.due_day && (
                <span className="p-chip p-chip-neutral">
                  Venc. dia {student.due_day}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <StatCard
          icon={Calendar}
          label="Aulas registradas"
          value={stats.total}
          tone="primary"
        />
        <StatCard
          icon={CheckCircle2}
          label="Presenças"
          value={stats.presentes}
          tone="success"
        />
        <StatCard
          icon={XCircle}
          label="Faltas"
          value={stats.ausentes}
          tone="danger"
        />
        <div className="p-card p-card-hover flex flex-col gap-3 p-4 md:p-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--p-primary-50)] text-[var(--p-primary)]">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs text-[var(--p-text-muted)]">Assiduidade</div>
            <div className={`p-kpi-value mt-1 text-2xl md:text-[26px] ${pctTone}`}>
              {stats.total > 0 ? `${stats.pct}%` : "—"}
            </div>
            <div className="mt-0.5 text-xs text-[var(--p-text-faint)]">
              {stats.total > 0
                ? `${stats.presentes} de ${stats.total} aulas`
                : "sem registros"}
            </div>
          </div>
        </div>
      </section>

      {/* Filtro por turma (se mais de uma) */}
      {turmas.length > 1 && (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1 min-w-max">
            <button
              onClick={() => setTurmaFilter("all")}
              className={[
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                turmaFilter === "all"
                  ? "bg-[var(--p-primary)] text-white"
                  : "bg-[var(--p-surface)] border border-[var(--p-border)] text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]",
              ].join(" ")}
            >
              <Users className="h-3.5 w-3.5" />
              Todas
              <span
                className={[
                  "rounded-full px-1.5 text-xs font-medium tabular-nums",
                  turmaFilter === "all"
                    ? "bg-white/20 text-white"
                    : "bg-[var(--p-surface-2)] text-[var(--p-text-faint)]",
                ].join(" ")}
              >
                {rows.length}
              </span>
            </button>
            {turmas.map((t) => {
              const active = turmaFilter === t.name;
              return (
                <button
                  key={t.name}
                  onClick={() => setTurmaFilter(t.name)}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-[var(--p-primary)] text-white"
                      : "bg-[var(--p-surface)] border border-[var(--p-border)] text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]",
                  ].join(" ")}
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  {t.name}
                  <span
                    className={[
                      "rounded-full px-1.5 text-xs font-medium tabular-nums",
                      active
                        ? "bg-white/20 text-white"
                        : "bg-[var(--p-surface-2)] text-[var(--p-text-faint)]",
                    ].join(" ")}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabela / Lista */}
      <div className="p-card overflow-hidden">
        {sortedRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--p-surface-2)] text-[var(--p-text-muted)]">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium">
              Nenhum registro de presença
            </div>
            <div className="text-xs text-[var(--p-text-muted)]">
              {turmaFilter !== "all"
                ? "Tente outra turma."
                : "Os registros aparecerão aqui quando houver aulas com presença marcada."}
            </div>
          </div>
        ) : (
          <>
            {/* Tabela desktop */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--p-border)] bg-[var(--p-surface-2)] text-left text-xs font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                    <th className="px-5 py-3">Data</th>
                    <th className="px-5 py-3">Turma</th>
                    <th className="px-5 py-3">Presença</th>
                    <th className="px-5 py-3">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--p-border)]">
                  {sortedRows.map((r, idx) => (
                    <tr
                      key={
                        r.id ??
                        (r.session_id && r.student_id
                          ? `${r.session_id}:${r.student_id}`
                          : `row-${idx}`)
                      }
                      className="hover:bg-[var(--p-surface-2)]"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium">
                          {fmtBR(r.session_date_snapshot)}
                        </div>
                        <div className="text-[11px] text-[var(--p-text-faint)]">
                          {fmtBR_long(r.session_date_snapshot)}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {r.turma_name_snapshot ? (
                          <span className="p-chip p-chip-neutral">
                            {r.turma_name_snapshot}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--p-text-faint)]">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {r.present ? (
                          <span className="p-chip p-chip-success">
                            <CheckCircle2 className="h-3 w-3" /> Presente
                          </span>
                        ) : (
                          <span className="p-chip p-chip-danger">
                            <XCircle className="h-3 w-3" /> Ausente
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[var(--p-text-muted)]">
                        {r.note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Lista mobile */}
            <ul className="divide-y divide-[var(--p-border)] md:hidden">
              {sortedRows.map((r, idx) => (
                <li
                  key={
                    r.id ??
                    (r.session_id && r.student_id
                      ? `${r.session_id}:${r.student_id}`
                      : `row-${idx}`)
                  }
                  className="flex items-start gap-3 px-4 py-3"
                >
                  <div className="w-14 shrink-0">
                    <div className="text-sm font-semibold tabular-nums">
                      {fmtBR(r.session_date_snapshot)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        {r.turma_name_snapshot && (
                          <div className="text-xs text-[var(--p-text-muted)] truncate">
                            {r.turma_name_snapshot}
                          </div>
                        )}
                        {r.note && (
                          <div className="mt-1 text-xs text-[var(--p-text-faint)] truncate">
                            {r.note}
                          </div>
                        )}
                      </div>
                      {r.present ? (
                        <span className="p-chip p-chip-success shrink-0">
                          <CheckCircle2 className="h-3 w-3" /> Presente
                        </span>
                      ) : (
                        <span className="p-chip p-chip-danger shrink-0">
                          <XCircle className="h-3 w-3" /> Ausente
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {sortedRows.length > 0 && (
        <div className="text-xs text-[var(--p-text-muted)]">
          Mostrando {sortedRows.length}{" "}
          {sortedRows.length === 1 ? "registro" : "registros"}
          {turmaFilter !== "all" ? ` em "${turmaFilter}"` : ""}.
        </div>
      )}
    </div>
  );
}

// ─── Componente: stat card ───────────────────────────────────────
function StatCard({ icon: Icon, label, value, tone }) {
  const toneCls =
    tone === "primary"
      ? "bg-[var(--p-primary-50)] text-[var(--p-primary)]"
      : tone === "success"
      ? "bg-[var(--p-success-50)] text-[var(--p-success)]"
      : tone === "danger"
      ? "bg-[var(--p-danger-50)] text-[var(--p-danger)]"
      : "bg-[var(--p-surface-2)] text-[var(--p-text)]";
  return (
    <div className="p-card p-card-hover flex flex-col gap-3 p-4 md:p-5">
      <div className={`grid h-9 w-9 place-items-center rounded-lg ${toneCls}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs text-[var(--p-text-muted)]">{label}</div>
        <div className="p-kpi-value mt-1 text-2xl md:text-[26px]">
          {value}
        </div>
      </div>
    </div>
  );
}

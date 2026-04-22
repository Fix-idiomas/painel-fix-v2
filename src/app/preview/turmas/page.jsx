"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PreviewShell from "../_components/PreviewShell";
import { financeGateway } from "@/lib/financeGateway";
import { supabase } from "@/lib/supabaseClient";
import {
  Search,
  Plus,
  Users,
  Clock,
  MoreHorizontal,
  CheckCircle2,
  PauseCircle,
  BookOpen,
  Loader2,
} from "lucide-react";

const AVATAR_PALETTE = [
  "#8B1C2C", "#E94F37", "#0F766E", "#D97706", "#1E40AF",
  "#7C3AED", "#BE123C", "#0891B2", "#15803D", "#9333EA", "#DC2626", "#059669",
];

const WEEKDAY_ABBR = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function colorFor(name) {
  const s = String(name || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function formatScheduleLine(rule) {
  if (!rule) return null;
  const wd = Number.isInteger(rule.weekday) ? WEEKDAY_ABBR[rule.weekday] : "?";
  const t = String(rule.time || "").slice(0, 5) || "—";
  const dur = Number(rule.duration_hours || 0);
  const mins = dur > 0 ? ` · ${Math.round(dur * 60)}min` : "";
  return `${wd} ${t}${mins}`;
}

function statusChip(s) {
  if (s === "lotada") return { cls: "p-chip-warning", icon: Users, label: "Lotada" };
  if (s === "vazia") return { cls: "p-chip-neutral", icon: PauseCircle, label: "Sem alunos" };
  return { cls: "p-chip-success", icon: CheckCircle2, label: "Ativa" };
}

export default function TurmasPreview() {
  const [turmas, setTurmas] = useState([]);
  const [teacherMap, setTeacherMap] = useState({});
  const [membersByTurma, setMembersByTurma] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [tu, teachers, membersRes] = await Promise.all([
          financeGateway.listTurmas(),
          financeGateway.listTeachers(),
          supabase.from("turma_members").select("turma_id"),
        ]);
        if (cancelled) return;
        if (membersRes?.error) throw new Error(membersRes.error.message);
        setTurmas(Array.isArray(tu) ? tu : []);
        const tMap = {};
        for (const t of teachers || []) tMap[t.id] = t.name;
        setTeacherMap(tMap);
        const counts = {};
        for (const m of membersRes.data || []) {
          counts[m.turma_id] = (counts[m.turma_id] || 0) + 1;
        }
        setMembersByTurma(counts);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const decorated = useMemo(() => {
    return turmas.map((t) => {
      const students = membersByTurma[t.id] || 0;
      const capacity = Number(t.capacity || 0);
      let status = "ativa";
      if (students === 0) status = "vazia";
      else if (capacity > 0 && students >= capacity) status = "lotada";
      return {
        ...t,
        _teacherName: t.teacher_id ? teacherMap[t.teacher_id] || "—" : "Sem professor",
        _students: students,
        _status: status,
      };
    });
  }, [turmas, teacherMap, membersByTurma]);

  const counts = useMemo(() => {
    const c = { total: decorated.length, ativa: 0, lotada: 0, vazia: 0, matriculados: 0 };
    for (const t of decorated) {
      c[t._status] = (c[t._status] || 0) + 1;
      c.matriculados += t._students;
    }
    return c;
  }, [decorated]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return decorated;
    return decorated.filter((t) => {
      const n = String(t.name || "").toLowerCase();
      const tn = String(t._teacherName || "").toLowerCase();
      return n.includes(term) || tn.includes(term);
    });
  }, [decorated, q]);

  return (
    <PreviewShell
      active="turmas"
      crumb="Ensino"
      title="Turmas"
      rightAction={
        <button className="p-btn p-btn-primary">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova turma</span>
          <span className="sm:hidden">Nova</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Turmas</h1>
          <p className="text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${counts.total} turmas · ${counts.ativa} ativas · ${counts.lotada} lotadas · ${counts.vazia} sem alunos · ${counts.matriculados} matriculados`}
          </p>
        </div>

        <div className="mb-5">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--p-text-faint)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar turma ou professor…"
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--p-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
            Erro ao carregar turmas: {error}
          </div>
        )}

        {loading ? (
          <div className="p-card flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando turmas…
          </div>
        ) : filtered.length === 0 && !error ? (
          <div className="p-card flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--p-surface-2)] text-[var(--p-text-muted)]">
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium">Nenhuma turma encontrada</div>
            <div className="text-xs text-[var(--p-text-muted)]">
              {q ? "Tente ajustar a busca." : "Cadastre uma turma para começar."}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
            {filtered.map((t) => {
              const { cls, icon: Icon, label } = statusChip(t._status);
              const capacity = Number(t.capacity || 0);
              const fill = capacity > 0 ? Math.min(100, Math.round((t._students / capacity) * 100)) : 0;
              const rules = Array.isArray(t.meeting_rules) ? t.meeting_rules : [];
              return (
                <div key={t.id} className="p-card p-card-hover flex flex-col">
                  <div className="h-1.5 rounded-t-2xl" style={{ background: colorFor(t.name) }} />
                  <div className="flex flex-1 flex-col p-5">
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold truncate">{t.name || "—"}</h3>
                        <div className="mt-0.5 text-xs text-[var(--p-text-muted)] truncate">
                          Prof. {t._teacherName}
                        </div>
                      </div>
                      <button className="-mr-1 rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex flex-col gap-1 text-xs text-[var(--p-text-muted)]">
                      {rules.length === 0 ? (
                        <span className="inline-flex items-center gap-2 text-[var(--p-text-faint)]">
                          <Clock className="h-3.5 w-3.5" /> Sem horário cadastrado
                        </span>
                      ) : (
                        rules.slice(0, 3).map((r, i) => (
                          <div key={i} className="inline-flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{formatScheduleLine(r)}</span>
                          </div>
                        ))
                      )}
                      {rules.length > 3 && (
                        <span className="text-[var(--p-text-faint)]">+{rules.length - 3} outros horários</span>
                      )}
                    </div>

                    <div className="mt-4">
                      <div className="flex items-baseline justify-between">
                        <div className="text-xs text-[var(--p-text-muted)]">Ocupação</div>
                        <div className="text-xs font-medium tabular-nums">
                          {t._students}{capacity > 0 ? `/${capacity}` : ""}
                        </div>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--p-surface-2)]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${fill}%`,
                            background: fill >= 100 ? "var(--p-warning)" : "var(--p-primary)",
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-[var(--p-border)] pt-3">
                      <span className={`p-chip ${cls}`}>
                        <Icon className="h-3 w-3" /> {label}
                      </span>
                      <Link href="#" className="text-xs font-medium text-[var(--p-primary)] hover:text-[var(--p-primary-600)]">
                        Ver detalhes →
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PreviewShell>
  );
}

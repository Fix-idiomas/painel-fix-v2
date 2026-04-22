"use client";

import { useEffect, useMemo, useState } from "react";
import PreviewShell from "../_components/PreviewShell";
import { financeGateway } from "@/lib/financeGateway";
import {
  Search,
  Plus,
  Mail,
  MoreHorizontal,
  Users,
  Loader2,
} from "lucide-react";

const AVATAR_PALETTE = [
  "#8B1C2C", "#E94F37", "#0F766E", "#D97706", "#1E40AF",
  "#7C3AED", "#BE123C", "#0891B2", "#15803D", "#9333EA", "#DC2626", "#059669",
];

function initialsFrom(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name) {
  const s = String(name || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export default function PagadoresPreview() {
  const [payers, setPayers] = useState([]);
  const [studentsByPayer, setStudentsByPayer] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [py, st] = await Promise.all([
          financeGateway.listPayers(),
          financeGateway.listStudents(),
        ]);
        if (cancelled) return;
        setPayers(Array.isArray(py) ? py : []);
        const grouped = {};
        for (const s of st || []) {
          if (!s.payer_id) continue;
          if (!grouped[s.payer_id]) grouped[s.payer_id] = [];
          grouped[s.payer_id].push(s);
        }
        setStudentsByPayer(grouped);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return payers;
    return payers.filter((p) => {
      const n = String(p.name || "").toLowerCase();
      const e = String(p.email || "").toLowerCase();
      return n.includes(term) || e.includes(term);
    });
  }, [payers, q]);

  const withStudents = useMemo(
    () => payers.filter((p) => (studentsByPayer[p.id] || []).length > 0).length,
    [payers, studentsByPayer]
  );

  return (
    <PreviewShell
      active="cadastro"
      crumb="Cadastro"
      title="Pagadores"
      rightAction={
        <button className="p-btn p-btn-primary">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo pagador</span>
          <span className="sm:hidden">Novo</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Pagadores</h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${payers.length} pagadores · ${withStudents} com alunos vinculados`}
          </p>
        </div>

        <div className="mb-5 max-w-md">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--p-text-faint)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome ou e-mail…"
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--p-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
            Erro ao carregar pagadores: {error}
          </div>
        )}

        <div className="p-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando pagadores…
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--p-border)] bg-[var(--p-surface-2)] text-left text-xs font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                      <th className="px-5 py-3">Pagador</th>
                      <th className="px-5 py-3">E-mail</th>
                      <th className="px-5 py-3">Alunos</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--p-border)]">
                    {filtered.map((p) => {
                      const students = studentsByPayer[p.id] || [];
                      return (
                        <tr key={p.id} className="hover:bg-[var(--p-surface-2)]">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div
                                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                                style={{ background: colorFor(p.name) }}
                              >
                                {initialsFrom(p.name)}
                              </div>
                              <div className="font-medium truncate">{p.name || "—"}</div>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            {p.email ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--p-text-muted)]">
                                <Mail className="h-3 w-3" /> {p.email}
                              </span>
                            ) : (
                              <span className="text-xs text-[var(--p-text-faint)]">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            {students.length === 0 ? (
                              <span className="text-xs text-[var(--p-text-faint)]">Sem vínculos</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {students.slice(0, 4).map((s) => (
                                  <span key={s.id} className="p-chip p-chip-neutral">{s.name}</span>
                                ))}
                                {students.length > 4 && (
                                  <span className="p-chip p-chip-neutral">+{students.length - 4}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-[var(--p-border)] md:hidden">
                {filtered.map((p) => {
                  const students = studentsByPayer[p.id] || [];
                  return (
                    <li key={p.id} className="flex items-start gap-3 px-4 py-3">
                      <div
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                        style={{ background: colorFor(p.name) }}
                      >
                        {initialsFrom(p.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.name || "—"}</div>
                        {p.email && (
                          <div className="text-xs text-[var(--p-text-muted)] truncate">{p.email}</div>
                        )}
                        {students.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {students.slice(0, 3).map((s) => (
                              <span key={s.id} className="p-chip p-chip-neutral">{s.name}</span>
                            ))}
                            {students.length > 3 && (
                              <span className="p-chip p-chip-neutral">+{students.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {filtered.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--p-surface-2)] text-[var(--p-text-muted)]">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-medium">Nenhum pagador encontrado</div>
                  <div className="text-xs text-[var(--p-text-muted)]">
                    {q ? "Tente ajustar a busca." : "Cadastre um pagador para começar."}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-xs text-[var(--p-text-muted)]">
            <div>Mostrando {filtered.length} de {payers.length}</div>
          </div>
        )}
      </div>
    </PreviewShell>
  );
}

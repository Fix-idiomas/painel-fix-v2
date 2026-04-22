"use client";

import { useEffect, useMemo, useState } from "react";
import PreviewShell from "../_components/PreviewShell";
import { financeGateway } from "@/lib/financeGateway";
import { supabase } from "@/lib/supabaseClient";
import {
  Search,
  Plus,
  Filter,
  ChevronDown,
  MoreHorizontal,
  CheckCircle2,
  PauseCircle,
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

function formatMoney(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatBirth(d) {
  if (!d) return "—";
  const [y, m, day] = String(d).split("-");
  if (!y || !m || !day) return "—";
  return `${day}/${m}/${y}`;
}

function statusChip(s) {
  if (s === "ativo") return { cls: "p-chip-success", icon: CheckCircle2, label: "Ativo" };
  return { cls: "p-chip-neutral", icon: PauseCircle, label: "Inativo" };
}

export default function AlunosPreview() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("ativo");
  const [signedMap, setSignedMap] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const rows = await financeGateway.listStudents();
        if (cancelled) return;
        setList(Array.isArray(rows) ? rows : []);
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Prefetch signed URLs for visible students with photo_url.
  useEffect(() => {
    const pending = list
      .map((s) => String(s.photo_url || "").trim())
      .filter(Boolean)
      .filter((p) => !signedMap[p])
      .slice(0, 60);
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        pending.map(async (path) => {
          try {
            const { data, error } = await supabase.storage
              .from("student-photos")
              .createSignedUrl(path, 600);
            if (error) return null;
            return [path, data?.signedUrl || null];
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      const next = {};
      for (const e of entries) if (e && e[1]) next[e[0]] = e[1];
      if (Object.keys(next).length) setSignedMap((m) => ({ ...m, ...next }));
    })();
    return () => { cancelled = true; };
  }, [list, signedMap]);

  const counts = useMemo(() => {
    const c = { todos: list.length, ativo: 0, inativo: 0 };
    for (const s of list) {
      if (s.status === "ativo") c.ativo += 1;
      else if (s.status === "inativo") c.inativo += 1;
    }
    return c;
  }, [list]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    return list.filter((s) => {
      if (filter !== "todos" && s.status !== filter) return false;
      if (!term) return true;
      const name = String(s.name || "").toLowerCase();
      const cpfDigits = String(s.cpf || "").replace(/\D/g, "");
      return name.includes(term) || (digits && cpfDigits.includes(digits));
    });
  }, [list, q, filter]);

  const FILTERS = [
    { key: "ativo", label: "Ativos", count: counts.ativo },
    { key: "inativo", label: "Inativos", count: counts.inativo },
    { key: "todos", label: "Todos", count: counts.todos },
  ];

  return (
    <PreviewShell
      active="cadastro"
      crumb="Cadastro"
      title="Alunos"
      rightAction={
        <button className="p-btn p-btn-primary">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo aluno</span>
          <span className="sm:hidden">Novo</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Alunos</h1>
          <p className="text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${counts.todos} cadastrados · ${counts.ativo} ativos · ${counts.inativo} inativos`}
          </p>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--p-text-faint)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome ou CPF…"
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--p-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </div>
          <button className="p-btn p-btn-ghost sm:w-auto" disabled>
            <Filter className="h-4 w-4" />
            <span>Filtros</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
        </div>

        <div className="mb-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-1 min-w-max">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-[var(--p-primary)] text-white"
                      : "bg-[var(--p-surface)] border border-[var(--p-border)] text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]",
                  ].join(" ")}
                >
                  {f.label}
                  <span className={[
                    "rounded-full px-1.5 text-xs font-medium tabular-nums",
                    active ? "bg-white/20 text-white" : "bg-[var(--p-surface-2)] text-[var(--p-text-faint)]",
                  ].join(" ")}>
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
            Erro ao carregar alunos: {error}
          </div>
        )}

        <div className="p-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando alunos…
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--p-border)] bg-[var(--p-surface-2)] text-left text-xs font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                      <th className="px-5 py-3">Aluno</th>
                      <th className="px-5 py-3">Mensalidade</th>
                      <th className="px-5 py-3">Vencimento</th>
                      <th className="px-5 py-3">Nascimento</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--p-border)]">
                    {filtered.map((s) => {
                      const { cls, icon: Icon, label } = statusChip(s.status);
                      const photoPath = String(s.photo_url || "").trim();
                      const photoUrl = photoPath ? signedMap[photoPath] : null;
                      return (
                        <tr key={s.id} className="hover:bg-[var(--p-surface-2)]">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar name={s.name} photoUrl={photoUrl} />
                              <div className="min-w-0">
                                <div className="font-medium truncate">{s.name || "—"}</div>
                                {s.email && (
                                  <div className="text-xs text-[var(--p-text-muted)] truncate">{s.email}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 tabular-nums">{formatMoney(s.monthly_value)}</td>
                          <td className="px-5 py-3 tabular-nums text-[var(--p-text-muted)]">
                            dia {s.due_day ?? "—"}
                          </td>
                          <td className="px-5 py-3 tabular-nums text-[var(--p-text-muted)]">
                            {formatBirth(s.birth_date)}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`p-chip ${cls}`}>
                              <Icon className="h-3 w-3" /> {label}
                            </span>
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
                {filtered.map((s) => {
                  const { cls, icon: Icon, label } = statusChip(s.status);
                  const photoPath = String(s.photo_url || "").trim();
                  const photoUrl = photoPath ? signedMap[photoPath] : null;
                  return (
                    <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                      <Avatar name={s.name} photoUrl={photoUrl} size="lg" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{s.name || "—"}</div>
                            <div className="text-xs text-[var(--p-text-muted)] truncate">
                              {s.email || `Nasc.: ${formatBirth(s.birth_date)}`}
                            </div>
                          </div>
                          <span className={`p-chip ${cls} shrink-0`}>
                            <Icon className="h-3 w-3" /> {label}
                          </span>
                        </div>
                        <div className="mt-2 flex items-baseline justify-between text-xs">
                          <span className="text-[var(--p-text-muted)]">
                            {formatMoney(s.monthly_value)}/mês · venc. dia {s.due_day ?? "—"}
                          </span>
                        </div>
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
                  <div className="text-sm font-medium">Nenhum aluno encontrado</div>
                  <div className="text-xs text-[var(--p-text-muted)]">
                    {q ? "Tente ajustar a busca." : "Nenhum aluno neste filtro."}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!loading && filtered.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-xs text-[var(--p-text-muted)]">
            <div>Mostrando {filtered.length} de {counts.todos}</div>
          </div>
        )}
      </div>
    </PreviewShell>
  );
}

function Avatar({ name, photoUrl, size = "md" }) {
  const dims = size === "lg" ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs";
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name || "aluno"}
        className={`${dims} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <div
      className={`${dims} shrink-0 grid place-items-center rounded-full font-semibold text-white`}
      style={{ background: colorFor(name) }}
      aria-hidden
    >
      {initialsFrom(name)}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import PreviewShell from "../_components/PreviewShell";
import PreviewModal, { FormError, ModalActions, ConfirmDeleteModal } from "../_components/PreviewModal";
import { financeGateway } from "@/lib/financeGateway";
import {
  Search,
  Plus,
  Mail,
  Phone,
  BookOpen,
  DollarSign,
  CalendarCheck,
  Trash2,
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

function money(v) {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusChip(s) {
  if (s === "ativo") return { cls: "p-chip-success", icon: CheckCircle2, label: "Ativo" };
  return { cls: "p-chip-neutral", icon: PauseCircle, label: "Inativo" };
}

export default function ProfessoresPreview() {
  const [teachers, setTeachers] = useState([]);
  const [turmasByTeacher, setTurmasByTeacher] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  async function load() {
    try {
      setError(null);
      const [ts, tu] = await Promise.all([
        financeGateway.listTeachers(),
        financeGateway.listTurmas(),
      ]);
      setTeachers(Array.isArray(ts) ? ts : []);
      const grouped = {};
      for (const t of tu || []) {
        if (!t.teacher_id) continue;
        grouped[t.teacher_id] = (grouped[t.teacher_id] || 0) + 1;
      }
      setTurmasByTeacher(grouped);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const c = { total: teachers.length, ativo: 0, inativo: 0 };
    for (const t of teachers) {
      if (t.status === "ativo") c.ativo += 1;
      else c.inativo += 1;
    }
    return c;
  }, [teachers]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return teachers;
    return teachers.filter((t) => {
      const n = String(t.name || "").toLowerCase();
      const e = String(t.email || "").toLowerCase();
      return n.includes(term) || e.includes(term);
    });
  }, [teachers, q]);

  return (
    <PreviewShell
      active="cadastro"
      crumb="Cadastro"
      title="Professores"
      rightAction={
        <button className="p-btn p-btn-primary" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo professor</span>
          <span className="sm:hidden">Novo</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Professores</h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${counts.total} professores · ${counts.ativo} ativos · ${counts.inativo} inativos`}
          </p>
        </div>

        <div className="mb-5 max-w-md">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--p-text-faint)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar professor…"
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--p-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
            Erro ao carregar professores: {error}
          </div>
        )}

        {loading ? (
          <div className="p-card flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando professores…
          </div>
        ) : filtered.length === 0 && !error ? (
          <div className="p-card flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--p-surface-2)] text-[var(--p-text-muted)]">
              <Users className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium">Nenhum professor encontrado</div>
            <div className="text-xs text-[var(--p-text-muted)]">
              {q ? "Tente ajustar a busca." : "Cadastre um professor para começar."}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4">
            {filtered.map((t) => {
              const { cls, icon: Icon, label } = statusChip(t.status);
              const turmasCount = turmasByTeacher[t.id] || 0;
              return (
                <div key={t.id} className="p-card p-card-hover p-5">
                  <div className="flex items-start gap-3">
                    <div
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                      style={{ background: colorFor(t.name) }}
                    >
                      {initialsFrom(t.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-base font-semibold truncate">{t.name || "—"}</div>
                          <div className="mt-0.5 text-xs text-[var(--p-text-muted)] flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            {t.email && (
                              <span className="inline-flex items-center gap-1 truncate max-w-full">
                                <Mail className="h-3 w-3 shrink-0" /> {t.email}
                              </span>
                            )}
                            {t.phone && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3 shrink-0" /> {t.phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setToDelete(t)}
                          className="-mr-1 rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-danger)]"
                          aria-label="Remover"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <Stat icon={BookOpen} label="Turmas" value={turmasCount} />
                        <Stat icon={DollarSign} label="Hora" value={money(t.hourly_rate)} small />
                        <Stat icon={CalendarCheck} label="Pagto" value={t.pay_day ? `dia ${t.pay_day}` : "—"} small />
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-[var(--p-border)] pt-3">
                        <span className={`p-chip ${cls}`}><Icon className="h-3 w-3" /> {label}</span>
                        {t.rate_mode === "by_size" && (
                          <span className="text-[11px] text-[var(--p-text-faint)]">Taxa por tamanho</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalOpen && (
        <NewTeacherModal
          onClose={() => setModalOpen(false)}
          onCreated={async () => {
            setModalOpen(false);
            await load();
          }}
        />
      )}

      {toDelete && (
        <ConfirmDeleteModal
          title="Remover professor"
          itemName={toDelete.name}
          description={
            (turmasByTeacher[toDelete.id] || 0) > 0
              ? `Este professor tem ${turmasByTeacher[toDelete.id]} turma(s) associada(s). As turmas ficarão sem professor atribuído.`
              : "Esta ação não pode ser desfeita."
          }
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await financeGateway.deleteTeacher(toDelete.id);
            setToDelete(null);
            await load();
          }}
        />
      )}
    </PreviewShell>
  );
}

function NewTeacherModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [payDay, setPayDay] = useState("5");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    const trimmed = name.trim();
    if (!trimmed) { setErr("Nome é obrigatório"); return; }
    const pd = Number(payDay);
    if (!Number.isInteger(pd) || pd < 1 || pd > 28) {
      setErr("Dia de pagamento deve ser entre 1 e 28");
      return;
    }
    try {
      setSaving(true);
      await financeGateway.createTeacher({
        name: trimmed,
        email: email.trim() || null,
        phone: phone.trim() || null,
        hourly_rate: Number(hourlyRate) || 0,
        pay_day: pd,
        status: "ativo",
        rate_mode: "flat",
      });
      await onCreated();
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <PreviewModal title="Novo professor" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">Nome completo *</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Ana Costa"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="professor@exemplo.com"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">Telefone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(00) 00000-0000"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">Valor/hora (R$)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">Dia de pagamento</span>
            <input
              type="number"
              min="1"
              max="28"
              value={payDay}
              onChange={(e) => setPayDay(e.target.value)}
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </label>
        </div>
        <ModalActions onCancel={onClose} submitting={saving} submitLabel="Cadastrar" submitIcon={saving ? Loader2 : Plus} />
      </form>
    </PreviewModal>
  );
}

function Stat({ icon: Icon, label, value, small }) {
  return (
    <div className="rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-2)] p-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--p-text-faint)]">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`mt-0.5 font-semibold tabular-nums ${small ? "text-sm" : "text-base"}`}>{value}</div>
    </div>
  );
}

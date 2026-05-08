"use client";

import { useEffect, useMemo, useState } from "react";
import { financeGateway } from "@/lib/financeGateway";
import {
  Search,
  Plus,
  Mail,
  Phone,
  BookOpen,
  Users as UsersIcon,
  Wallet,
  CalendarCheck,
  Trash2,
  Pencil,
  CheckCircle2,
  PauseCircle,
  Users,
  Loader2,
  Eye,
  X,
} from "lucide-react";
import AppModal, {
  FormError,
  ModalActions,
  ConfirmDeleteModal,
} from "@/components/AppModal";

// ─── Helpers ─────────────────────────────────────────────────────
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
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function fmtDateBR(d) {
  if (!d) return "—";
  const s = String(d);
  const isoLike = s.length > 10 ? s : `${s}T00:00:00`;
  const dt = new Date(isoLike);
  if (isNaN(dt)) return s.slice(0, 10);
  return dt.toLocaleDateString("pt-BR");
}
function statusChip(s) {
  if (s === "ativo")
    return { cls: "p-chip-success", icon: CheckCircle2, label: "Ativo" };
  return { cls: "p-chip-neutral", icon: PauseCircle, label: "Inativo" };
}
const monthNow = () => new Date().toISOString().slice(0, 7);

// ─── Página ──────────────────────────────────────────────────────
export default function ProfessoresPage() {
  const [teachers, setTeachers] = useState([]);
  const [turmas, setTurmas] = useState([]);
  const [students, setStudents] = useState([]);
  const [members, setMembers] = useState([]); // {turma_id, student_id}
  const [payouts, setPayouts] = useState({}); // { [teacher_id]: {hours, sessions, amount, hourly_rate, pay_day} }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [ym, setYm] = useState(monthNow());

  // modais
  const [editTarget, setEditTarget] = useState(null); // null = novo, objeto = editar
  const [editOpen, setEditOpen] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  // ─── Load principal ────────────────────────────────────────────
  async function load() {
    try {
      setError(null);
      const [ths, tms, sts] = await Promise.all([
        financeGateway.listTeachers(),
        financeGateway.listTurmas(),
        financeGateway.listStudents(),
      ]);
      // Membros de todas as turmas (necessário para contagem por professor)
      let allMems = [];
      for (const t of tms) {
        const ms = await financeGateway.listTurmaMembers(t.id);
        allMems = allMems.concat(
          ms.map((m) => ({ turma_id: t.id, student_id: m.id }))
        );
      }
      setTeachers(Array.isArray(ths) ? ths : []);
      setTurmas(Array.isArray(tms) ? tms : []);
      setStudents(Array.isArray(sts) ? sts : []);
      setMembers(allMems);
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
    return () => {
      cancelled = true;
    };
  }, []);

  // Calcula payouts (mês selecionado) para cada professor
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out = {};
      for (const t of teachers) {
        try {
          const p = await financeGateway.sumTeacherPayoutByMonth(t.id, ym);
          out[t.id] = p;
        } catch {
          out[t.id] = {
            hours: 0,
            sessions: 0,
            amount: 0,
            hourly_rate: t.hourly_rate || 0,
            pay_day: t.pay_day || 5,
          };
        }
      }
      if (!cancelled) setPayouts(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [teachers, ym]);

  // Mapa turmaId → nome
  const turmaNameOf = useMemo(() => {
    const map = new Map();
    turmas.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [turmas]);

  // Linhas agregadas
  const rows = useMemo(() => {
    return teachers.map((th) => {
      const myTurmas = turmas
        .filter((t) => t.teacher_id === th.id)
        .map((t) => t.id);
      const myMembers = members.filter((m) => myTurmas.includes(m.turma_id));
      const myStudents = myMembers
        .map((m) => students.find((s) => s.id === m.student_id))
        .filter(Boolean);
      const activeCount = myStudents.filter((s) => s.status === "ativo").length;
      const inactiveCount = myStudents.filter(
        (s) => s.status !== "ativo"
      ).length;
      const sumMonthlyActive = myStudents
        .filter((s) => s.status === "ativo")
        .reduce((acc, s) => acc + Number(s.monthly_value || 0), 0);
      const pay = payouts[th.id] || {
        hours: 0,
        sessions: 0,
        amount: 0,
        hourly_rate: th.hourly_rate || 0,
        pay_day: th.pay_day || 5,
      };
      return {
        teacher: th,
        turmaCount: myTurmas.length,
        activeCount,
        inactiveCount,
        sumMonthlyActive,
        payout: pay,
      };
    });
  }, [teachers, turmas, members, students, payouts]);

  const filteredRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const n = String(r.teacher.name || "").toLowerCase();
      const e = String(r.teacher.email || "").toLowerCase();
      return n.includes(term) || e.includes(term);
    });
  }, [rows, q]);

  const counts = useMemo(() => {
    const c = { total: teachers.length, ativo: 0, inativo: 0 };
    for (const t of teachers) {
      if (t.status === "ativo") c.ativo += 1;
      else c.inativo += 1;
    }
    return c;
  }, [teachers]);

  const totalPayout = useMemo(
    () =>
      Object.values(payouts || {}).reduce(
        (acc, p) => acc + Number(p?.amount || 0),
        0
      ),
    [payouts]
  );

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Professores
          </h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${counts.total} professores · ${counts.ativo} ativos · ${counts.inativo} inativos`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <label className="text-[var(--p-text-muted)]">Competência:</label>
            <input
              type="month"
              value={ym}
              onChange={(e) => setYm(e.target.value.slice(0, 7))}
              className="rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            />
          </div>
          <button
            className="p-btn p-btn-primary"
            onClick={() => {
              setEditTarget(null);
              setEditOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Novo professor</span>
          </button>
        </div>
      </div>

      {/* Resumo total a pagar */}
      <div className="p-card flex items-center justify-between gap-3 px-5 py-3">
        <div className="text-xs uppercase tracking-wider text-[var(--p-text-faint)]">
          Total a pagar no mês
        </div>
        <div
          className="p-kpi-value text-xl"
          style={{ color: "var(--p-primary)" }}
        >
          {money(totalPayout)}
        </div>
      </div>

      {/* Busca */}
      <div className="max-w-md">
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
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          Erro: {error}
        </div>
      )}

      {/* Grade de cards */}
      {loading ? (
        <div className="p-card flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando professores…
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="p-card flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--p-surface-2)] text-[var(--p-text-muted)]">
            <Users className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium">
            Nenhum professor encontrado
          </div>
          <div className="text-xs text-[var(--p-text-muted)]">
            {q ? "Tente ajustar a busca." : "Cadastre um professor para começar."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:gap-4">
          {filteredRows.map(
            ({ teacher: t, turmaCount, activeCount, payout }) => {
              const { cls, icon: Icon, label } = statusChip(t.status);
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
                          <div className="text-base font-semibold truncate">
                            {t.name || "—"}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--p-text-muted)]">
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
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => {
                              setEditTarget(t);
                              setEditOpen(true);
                            }}
                            className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                            aria-label="Editar"
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDetailsTarget(t)}
                            className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text)]"
                            aria-label="Detalhes do mês"
                            title="Detalhes do mês"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setToDelete(t)}
                            className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)]"
                            aria-label="Remover"
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Stats grid */}
                      <div className="mt-4 grid grid-cols-4 gap-2">
                        <Stat
                          icon={BookOpen}
                          label="Turmas"
                          value={turmaCount}
                        />
                        <Stat
                          icon={UsersIcon}
                          label="Alunos"
                          value={activeCount}
                          small
                        />
                        <Stat
                          icon={CalendarCheck}
                          label="Pagto"
                          value={t.pay_day ? `dia ${t.pay_day}` : "—"}
                          small
                        />
                        <Stat
                          icon={Wallet}
                          label="A pagar"
                          value={money(payout.amount)}
                          small
                          highlight
                        />
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-[var(--p-border)] pt-3">
                        <div className="flex items-center gap-2">
                          <span className={`p-chip ${cls}`}>
                            <Icon className="h-3 w-3" /> {label}
                          </span>
                          {t.rate_mode === "by_size" ? (
                            <span className="text-[11px] text-[var(--p-text-faint)]">
                              Taxa por tamanho
                            </span>
                          ) : (
                            <span className="text-[11px] text-[var(--p-text-faint)]">
                              {money(t.hourly_rate)}/h
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--p-text-faint)]">
                          {payout.sessions || 0} sessões ·{" "}
                          {Number(payout.hours || 0).toFixed(1)}h
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}

      {/* Modais */}
      {editOpen && (
        <TeacherFormModal
          initial={editTarget}
          onClose={() => {
            setEditOpen(false);
            setEditTarget(null);
          }}
          onSaved={async () => {
            setEditOpen(false);
            setEditTarget(null);
            await load();
          }}
        />
      )}

      {detailsTarget && (
        <DetailsOfMonthModal
          teacher={detailsTarget}
          ym={ym}
          payout={payouts[detailsTarget.id]}
          turmaNameOf={turmaNameOf}
          onClose={() => setDetailsTarget(null)}
        />
      )}

      {toDelete && (
        <ConfirmDeleteModal
          title="Remover professor"
          itemName={toDelete.name}
          description={
            (turmas.filter((t) => t.teacher_id === toDelete.id).length || 0) > 0
              ? `Este professor tem ${
                  turmas.filter((t) => t.teacher_id === toDelete.id).length
                } turma(s) associada(s). As turmas ficarão sem professor atribuído.`
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
    </div>
  );
}

// ─── Stat (card pequeno) ─────────────────────────────────────────
function Stat({ icon: Icon, label, value, small, highlight }) {
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        highlight
          ? "bg-[var(--p-primary-50)] border-[var(--p-primary)]/20"
          : "bg-[var(--p-surface-2)] border-[var(--p-border)]"
      }`}
    >
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-[var(--p-text-faint)]">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div
        className={`mt-0.5 font-semibold tabular-nums ${
          small ? "text-sm" : "text-base"
        } ${highlight ? "text-[var(--p-primary)]" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Modal: Cadastrar/Editar ─────────────────────────────────────
function TeacherFormModal({ initial, onClose, onSaved }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(() => ({
    name: initial?.name || "",
    email: initial?.email || "",
    phone: initial?.phone || "",
    status: initial?.status || "ativo",
    hourly_rate: String(initial?.hourly_rate ?? "0"),
    pay_day: String(initial?.pay_day ?? "5"),
    rate_mode: initial?.rate_mode || "flat",
    rate_rules: Array.isArray(initial?.rate_rules)
      ? initial.rate_rules.map((r) => ({
          min: String(r.min ?? ""),
          max: String(r.max ?? ""),
          rate: String(r.hourly_rate ?? r.rate ?? ""),
        }))
      : [],
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function addRule() {
    setForm((f) => ({
      ...f,
      rate_rules: [...(f.rate_rules || []), { min: "", max: "", rate: "" }],
    }));
  }
  function removeRule(idx) {
    setForm((f) => ({
      ...f,
      rate_rules: f.rate_rules.filter((_, i) => i !== idx),
    }));
  }
  function updateRule(idx, key, val) {
    setForm((f) => ({
      ...f,
      rate_rules: f.rate_rules.map((r, i) =>
        i === idx ? { ...r, [key]: val } : r
      ),
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    const trimmed = form.name.trim();
    if (!trimmed) return setErr("Nome é obrigatório");
    const pd = Number(form.pay_day);
    if (!Number.isInteger(pd) || pd < 1 || pd > 28)
      return setErr("Dia de pagamento deve ser entre 1 e 28");

    try {
      setSaving(true);
      const payload = {
        name: trimmed,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        status: form.status,
        pay_day: Math.min(Math.max(pd, 1), 28),
      };
      if (form.rate_mode === "by_size") {
        payload.rate_mode = "by_size";
        payload.rate_rules = (form.rate_rules || [])
          .map((r) => ({
            min: Number(r.min || 0),
            max: Number(r.max || 0),
            hourly_rate: Number(r.rate || 0),
          }))
          .filter((r) => r.max >= r.min);
        payload.hourly_rate = Number(form.hourly_rate || 0); // fallback
      } else {
        payload.rate_mode = "flat";
        payload.hourly_rate = Number(form.hourly_rate || 0);
        payload.rate_rules = [];
      }

      if (isEdit) {
        await financeGateway.updateTeacher(initial.id, payload);
      } else {
        await financeGateway.createTeacher(payload);
      }
      await onSaved();
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppModal
      title={isEdit ? "Editar professor" : "Novo professor"}
      onClose={saving ? () => {} : onClose}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
        <FormError message={err} />

        <FormField
          label="Nome completo *"
          value={form.name}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          autoFocus
          placeholder="Ex.: Ana Costa"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            label="E-mail"
            type="email"
            value={form.email}
            onChange={(v) => setForm((f) => ({ ...f, email: v }))}
            placeholder="professor@exemplo.com"
          />
          <FormField
            label="Telefone"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            placeholder="(00) 00000-0000"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-[var(--p-text-muted)]">
              Status
            </span>
            <select
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value }))
              }
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </label>
          <FormField
            label="Dia de pagamento"
            type="number"
            value={form.pay_day}
            onChange={(v) => setForm((f) => ({ ...f, pay_day: v }))}
            min={1}
            max={28}
          />
        </div>

        {/* Modo de tarifa */}
        <div className="border-t border-[var(--p-border)] pt-4">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Modo de tarifa
          </span>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:gap-6">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="rate_mode"
                checked={form.rate_mode === "flat"}
                onChange={() => setForm((f) => ({ ...f, rate_mode: "flat" }))}
              />
              Único (valor/hora fixo)
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="rate_mode"
                checked={form.rate_mode === "by_size"}
                onChange={() =>
                  setForm((f) => ({ ...f, rate_mode: "by_size" }))
                }
              />
              Por tamanho da turma
            </label>
          </div>
        </div>

        {form.rate_mode === "flat" ? (
          <FormField
            label="Valor/hora (R$)"
            type="number"
            step="0.01"
            min="0"
            value={form.hourly_rate}
            onChange={(v) => setForm((f) => ({ ...f, hourly_rate: v }))}
            placeholder="0,00"
          />
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--p-text-muted)]">
                Regras por tamanho de turma
              </span>
              <button
                type="button"
                onClick={addRule}
                className="p-btn p-btn-ghost h-8 px-3 text-xs"
              >
                <Plus className="h-3 w-3" /> Adicionar regra
              </button>
            </div>
            <div className="rounded-lg border border-[var(--p-border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[var(--p-surface-2)] text-left text-[10px] font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Mín</th>
                    <th className="px-3 py-2">Máx</th>
                    <th className="px-3 py-2">R$/hora</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--p-border)]">
                  {(form.rate_rules || []).length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-3 text-xs text-[var(--p-text-muted)]"
                      >
                        Nenhuma regra. Adicione pelo menos uma.
                      </td>
                    </tr>
                  ) : (
                    form.rate_rules.map((r, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            value={r.min}
                            onChange={(e) =>
                              updateRule(idx, "min", e.target.value)
                            }
                            className="w-20 rounded border border-[var(--p-border)] bg-[var(--p-surface)] px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            value={r.max}
                            onChange={(e) =>
                              updateRule(idx, "max", e.target.value)
                            }
                            className="w-20 rounded border border-[var(--p-border)] bg-[var(--p-surface)] px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={r.rate}
                            onChange={(e) =>
                              updateRule(idx, "rate", e.target.value)
                            }
                            className="w-24 rounded border border-[var(--p-border)] bg-[var(--p-surface)] px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeRule(idx)}
                            className="rounded p-1 text-[var(--p-text-muted)] hover:bg-[var(--p-danger-50)] hover:text-[var(--p-danger)]"
                            aria-label="Remover regra"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-[var(--p-text-faint)]">
              Ex.: (1–1 → 50), (2–2 → 55), (3–99 → 60). Sessões já registradas
              não mudam se você alterar as regras (usamos snapshot).
            </p>
          </div>
        )}

        <ModalActions
          onCancel={onClose}
          submitting={saving}
          submitLabel={isEdit ? "Salvar" : "Cadastrar"}
        />
      </form>
    </AppModal>
  );
}

// ─── Modal: Detalhes do mês ──────────────────────────────────────
function DetailsOfMonthModal({ teacher, ym, payout, turmaNameOf, onClose }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const list = await financeGateway.listTeacherSessionsByMonth(
          teacher.id,
          ym
        );
        if (!cancelled) setSessions(list || []);
      } catch (e) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teacher.id, ym]);

  return (
    <AppModal
      title={`${teacher.name} — ${ym}`}
      onClose={onClose}
      maxWidth="3xl"
    >
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat
            icon={CalendarCheck}
            label="Sessões"
            value={payout?.sessions ?? 0}
            small
          />
          <Stat
            icon={BookOpen}
            label="Horas"
            value={Number(payout?.hours || 0).toFixed(1)}
            small
          />
          <Stat
            icon={Wallet}
            label="A pagar"
            value={money(payout?.amount)}
            small
            highlight
          />
        </div>

        {err && <FormError message={err} />}

        <div className="rounded-lg border border-[var(--p-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--p-surface-2)] text-left text-[10px] font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
              <tr>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Turma</th>
                <th className="px-3 py-2">Duração (h)</th>
                <th className="px-3 py-2">Observação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--p-border)]">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center">
                    <div className="inline-flex items-center gap-2 text-sm text-[var(--p-text-muted)]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando…
                    </div>
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-sm text-[var(--p-text-muted)]"
                  >
                    Nenhuma sessão encontrada para este mês.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--p-surface-2)]">
                    <td className="px-3 py-2">{fmtDateBR(s.date)}</td>
                    <td className="px-3 py-2">
                      {turmaNameOf?.get(s.turma_id) || s.turma_id}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {Number(s.duration_hours || 0).toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-[var(--p-text-muted)]">
                      {s.notes || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="p-btn p-btn-ghost">
            Fechar
          </button>
        </div>
      </div>
    </AppModal>
  );
}

// ─── Form field reusable ─────────────────────────────────────────
function FormField({
  label,
  value,
  type = "text",
  onChange,
  placeholder,
  autoFocus,
  min,
  max,
  step,
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--p-text-muted)]">
        {label}
      </span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        min={min}
        max={max}
        step={step}
        className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
      />
    </label>
  );
}

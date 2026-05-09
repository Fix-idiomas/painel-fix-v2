// src/app/(app)/financeiro/mensalidades/page.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/contexts/SessionContext";
import { financeGateway } from "@/lib/financeGateway";
import { computeRevenueKPIs } from "@/lib/finance";
import {
  Search,
  Calendar,
  ChevronDown,
  Check,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  XCircle,
  MoreHorizontal,
  Download,
  Send,
  Sparkles,
  UserPlus,
  Loader2,
} from "lucide-react";
import AppModal, { FormError, ModalActions } from "@/components/AppModal";

// ─── Helpers ──────────────────────────────────────────────────────
const STATUS_LABELS = {
  pending: "Pendente",
  paid: "Pago",
  canceled: "Cancelado",
};

const fmtBRL = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const fmtBRDate = (s) => {
  if (!s) return "—";
  const parts = String(s).slice(0, 10).split("-");
  if (parts.length !== 3) return "—";
  const [Y, M, D] = parts;
  return `${D}.${M}.${Y}`;
};

function ymLabel(ym) {
  const [y, m] = String(ym || "").split("-");
  const names = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  const idx = Math.max(1, Math.min(12, Number(m || 0))) - 1;
  return `${names[idx]} de ${y}`;
}

function daysToDue(due) {
  const d0 = new Date();
  d0.setHours(0, 0, 0, 0);
  const d1 = new Date(String(due) + "T00:00:00");
  d1.setHours(0, 0, 0, 0);
  return Math.floor((d1 - d0) / 86400000);
}

function reminderStatus(due, status) {
  if (status !== "pending") return null;
  const dt = daysToDue(due);
  if (dt < 0) return "Atrasado";
  if (dt === 0) return "Vencido";
  if (dt > 0 && dt <= 7) return "A vencer";
  return null;
}

function statusChip(row) {
  const today = new Date().toISOString().slice(0, 10);
  if (row.status === "paid")
    return { cls: "p-chip-success", icon: CheckCircle2, label: "Pago" };
  if (row.status === "canceled")
    return { cls: "p-chip-neutral", icon: Clock, label: "Cancelado" };
  if (
    row.status === "pending" &&
    row.due_date &&
    String(row.due_date).slice(0, 10) < today
  ) {
    const days = row.days_overdue || 0;
    return { cls: "p-chip-danger", icon: AlertCircle, label: `Atraso ${days}d` };
  }
  return { cls: "p-chip-warning", icon: Clock, label: "Pendente" };
}

function monthRange(ymStr) {
  const start = `${ymStr}-01`;
  const d = new Date(`${ymStr}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const end = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-01`;
  return { start, end };
}

// ─── Templates de e-mail ──────────────────────────────────────────
const REMINDER_DEFAULTS = {
  subject: ({ status, studentName, dueDateBR }) =>
    status === "Atrasado"
      ? `Pagamento em atraso – ${studentName} (venc. ${dueDateBR})`
      : status === "Vencido"
      ? `Vence hoje – ${studentName} (${dueDateBR})`
      : `Lembrete de vencimento – ${studentName} (${dueDateBR})`,
  html: ({ tenantName, studentName, dueDateBR, amountBRL, status }) => `
<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5">
  <h2 style="margin:0 0 12px">${tenantName}</h2>
  <p>Olá! Este é um ${
    status === "Atrasado"
      ? "<b>lembrete de atraso</b>"
      : status === "Vencido"
      ? "<b>lembrete de vencimento hoje</b>"
      : "<b>lembrete de vencimento</b>"
  } referente à mensalidade de <b>${studentName}</b>.</p>
  <p><b>Vencimento:</b> ${dueDateBR}<br/>
     <b>Valor:</b> ${amountBRL}</p>
  <p>Se já realizou o pagamento, por favor desconsidere este aviso.</p>
  <p>Qualquer dúvida, fale com a secretaria.</p>
  <p style="margin-top:16px">— ${tenantName}</p>
</div>`,
  text: ({ tenantName, studentName, dueDateBR, amountBRL, status }) =>
    `${tenantName}
${
  status === "Atrasado"
    ? "Lembrete de atraso"
    : status === "Vencido"
    ? "Vence hoje"
    : "Lembrete de vencimento"
}
Aluno: ${studentName}
Vencimento: ${dueDateBR}
Valor: ${amountBRL}

Se já pagou, desconsidere. Dúvidas, contate a secretaria.
— ${tenantName}`,
};

function applyTemplate(str, vars) {
  if (!str) return "";
  return str.replace(/{{\s*(\w+)\s*}}/g, (_, k) => vars?.[k] ?? "");
}

async function getTenantReminderTemplate(status) {
  try {
    const res = await fetch(
      `/api/email-templates?kind=payment_reminder&status=${encodeURIComponent(status)}`,
      { method: "GET" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      subject: data.subject || "",
      html: data.html || "",
      text: data.text || "",
    };
  } catch {
    return null;
  }
}

function buildReminderEmail(row, session, tplMap) {
  const tenantName = session?.tenantName || "Sua escola";
  const studentName =
    row.student_name_snapshot || row.student_name || "Aluno";
  const dueDateBR = fmtBRDate(row.due_date);
  const amountBRL = fmtBRL(row.amount);
  const status = row.reminder_status;
  const v = { tenantName, studentName, dueDate: dueDateBR, amount: amountBRL, status };

  const tpl = tplMap?.get(status);
  if (tpl && (tpl.subject || tpl.html || tpl.text)) {
    return {
      to: row.email_to,
      subject: tpl.subject
        ? applyTemplate(tpl.subject, v)
        : REMINDER_DEFAULTS.subject({ status, studentName, dueDateBR }),
      html: tpl.html
        ? applyTemplate(tpl.html, v)
        : REMINDER_DEFAULTS.html({
            tenantName,
            studentName,
            dueDateBR,
            amountBRL,
            status,
          }),
      text: tpl.text
        ? applyTemplate(tpl.text, v)
        : REMINDER_DEFAULTS.text({
            tenantName,
            studentName,
            dueDateBR,
            amountBRL,
            status,
          }),
    };
  }

  return {
    to: row.email_to,
    subject: REMINDER_DEFAULTS.subject({ status, studentName, dueDateBR }),
    html: REMINDER_DEFAULTS.html({
      tenantName,
      studentName,
      dueDateBR,
      amountBRL,
      status,
    }),
    text: REMINDER_DEFAULTS.text({
      tenantName,
      studentName,
      dueDateBR,
      amountBRL,
      status,
    }),
  };
}

// ─── Página ──────────────────────────────────────────────────────
export default function MensalidadesPage() {
  const sess = useSession();
  const session = sess?.session;
  const ready = sess?.ready ?? false;

  const isOwner = session?.role === "owner";
  const isAdmin = isOwner || session?.role === "admin";

  // Permissões (DB é fonte da verdade)
  const [permChecked, setPermChecked] = useState(false);
  const [canReadDB, setCanReadDB] = useState(false);
  const [canWriteDB, setCanWriteDB] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      try {
        const { supabase } = await import("@/lib/supabaseClient");
        const { data: tenantId, error: tErr } = await supabase.rpc(
          "current_tenant_id"
        );
        if (tErr) throw tErr;
        const [readRes, writeRes] = await Promise.all([
          supabase.rpc("is_admin_or_finance_read", { p_tenant: tenantId }),
          supabase.rpc("is_admin_or_finance_write", { p_tenant: tenantId }),
        ]);
        if (!alive) return;
        if (readRes.error) throw readRes.error;
        if (writeRes.error) throw writeRes.error;
        setCanReadDB(!!readRes.data);
        setCanWriteDB(!!writeRes.data);
      } catch (e) {
        console.warn("perm check (mensalidades) failed:", e);
        setCanReadDB(false);
        setCanWriteDB(false);
      } finally {
        if (alive) setPermChecked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready]);

  // Estado
  const [ym, setYm] = useState(() => new Date().toISOString().slice(0, 7));
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revKpis, setRevKpis] = useState({
    receita_a_receber: 0,
    receita_recebida: 0,
    receita_atrasada: 0,
  });

  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  // Modais
  const [previewModal, setPreviewModal] = useState(null); // { items, generating }
  const [reminderModal, setReminderModal] = useState(null); // { rows, busy, sending, selectedIds }
  const [bulkPayerOpen, setBulkPayerOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);

  async function load() {
    try {
      setError(null);
      const resp = await financeGateway.listPayments({
        ym,
        status: filter === "all" || filter === "overdue" ? undefined : filter,
      });
      let loadedRows = Array.isArray(resp?.rows)
        ? resp.rows
        : Array.isArray(resp)
        ? resp
        : [];

      // Fallback (RLS puro) se vier vazio
      if (!loadedRows.length) {
        const { supabase } = await import("@/lib/supabaseClient");
        const { start, end } = monthRange(ym);
        let q1 = supabase
          .from("payments")
          .select(
            "id, tenant_id, status, due_date, amount, " +
              "student_name_snapshot, payer_name_snapshot, student_id, payer_id, paid_at, canceled_at"
          )
          .gte("due_date", start)
          .lt("due_date", end);
        const { data, error: qErr } = await q1;
        if (qErr) throw qErr;
        loadedRows = (data || []).map((r) => ({
          ...r,
          student_name: r.student_name_snapshot ?? "—",
          payer_name: r.payer_name_snapshot ?? "—",
          days_overdue:
            r.status === "pending"
              ? Math.max(
                  0,
                  Math.floor(
                    (new Date().setHours(0, 0, 0, 0) -
                      new Date(String(r.due_date) + "T00:00:00").setHours(
                        0,
                        0,
                        0,
                        0
                      )) /
                      86400000
                  )
                )
              : 0,
        }));
      }

      const rowsNorm = loadedRows.map((r) => ({
        ...r,
        student_name:
          r.student_name || r.student_name_snapshot || "—",
        amount: Number(r.amount || 0),
      }));
      setRows(rowsNorm);
      setRevKpis(
        computeRevenueKPIs(rowsNorm, { ym, policy: "due_date" }) || revKpis
      );
    } catch (e) {
      setError(e?.message || String(e));
      setRows([]);
    }
  }

  useEffect(() => {
    if (!permChecked || !canReadDB) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permChecked, canReadDB, ym, filter]);

  // Ações por linha
  async function markPaid(id) {
    if (!canWriteDB) return;
    try {
      setBusyId(id);
      await financeGateway.markPaid(id);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }
  async function reopen(id) {
    if (!canWriteDB) return;
    try {
      setBusyId(id);
      await financeGateway.reopenPayment(id);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }
  async function doCancel(id, note) {
    try {
      setBusyId(id);
      await financeGateway.cancelPayment(id, note || null);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }

  // Bulk actions
  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll(visibleIds) {
    setSelected((prev) => {
      const allSelected =
        visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) for (const id of visibleIds) next.delete(id);
      else for (const id of visibleIds) next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }
  async function handleBulkMarkPaid() {
    if (!canWriteDB || selected.size === 0) return;
    try {
      setBulkBusy(true);
      const result = await financeGateway.bulkMarkPaid(Array.from(selected));
      if (result?.failed?.length > 0) {
        setError(
          `${result.succeeded.length} marcadas, ${result.failed.length} falharam: ${result.failed[0].error}`
        );
      }
      clearSelection();
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBulkBusy(false);
    }
  }
  async function handleBulkReopen() {
    if (!canWriteDB || selected.size === 0) return;
    try {
      setBulkBusy(true);
      const result = await financeGateway.bulkReopenPayments(
        Array.from(selected)
      );
      if (result?.failed?.length > 0) {
        setError(
          `${result.succeeded.length} reabertas, ${result.failed.length} falharam: ${result.failed[0].error}`
        );
      }
      clearSelection();
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBulkBusy(false);
    }
  }

  // Prévia & Geração de mensalidades
  async function openPreview() {
    if (!canWriteDB) return;
    try {
      const rawPrev = (await financeGateway.previewGenerateMonth({ ym })) || [];
      // remove os que já existem
      const existingKeys = new Set(
        rows
          .map((r) => {
            const sid = r.student_id ?? null;
            const due = r.due_date ? String(r.due_date).slice(0, 10) : null;
            return sid && due ? `${sid}::${due}` : null;
          })
          .filter(Boolean)
      );
      const prev = rawPrev.filter((p) => {
        const sid = p.student_id ?? null;
        const due = p.due_date ? String(p.due_date).slice(0, 10) : null;
        return !(sid && due && existingKeys.has(`${sid}::${due}`));
      });

      // enriquecer com nomes
      const { supabase } = await import("@/lib/supabaseClient");
      const studentIds = [...new Set(prev.map((p) => p.student_id).filter(Boolean))];
      let studs = [];
      if (studentIds.length) {
        const tries = ["id, full_name, payer_id", "id, name, payer_id"];
        for (const cols of tries) {
          const { data, error } = await supabase
            .from("students")
            .select(cols)
            .in("id", studentIds);
          if (!error) {
            studs = data || [];
            break;
          }
        }
      }
      const studentNameById = Object.create(null);
      const payerIdByStudentId = Object.create(null);
      for (const s of studs) {
        studentNameById[s.id] = s.full_name ?? s.name ?? "";
        payerIdByStudentId[s.id] = s.payer_id ?? null;
      }
      const payerIdsSet = new Set(
        prev.map((p) => p.payer_id).filter(Boolean)
      );
      for (const sid of studentIds)
        if (payerIdByStudentId[sid]) payerIdsSet.add(payerIdByStudentId[sid]);
      let pays = [];
      if (payerIdsSet.size) {
        const tries = ["id, name", "id, full_name"];
        for (const cols of tries) {
          const { data, error } = await supabase
            .from("payers")
            .select(cols)
            .in("id", [...payerIdsSet]);
          if (!error) {
            pays = data || [];
            break;
          }
        }
      }
      const payerNameById = Object.create(null);
      for (const p of pays) payerNameById[p.id] = p.name ?? p.full_name ?? "";

      const enriched = prev.map((r) => {
        const pid = r.payer_id ?? payerIdByStudentId[r.student_id] ?? null;
        return {
          ...r,
          student_name:
            studentNameById[r.student_id] || r.student_name_snapshot || "—",
          payer_name: pid ? payerNameById[pid] || "—" : "—",
        };
      });
      setPreviewModal({ items: enriched, generating: false });
    } catch (e) {
      setError(e?.message || String(e));
    }
  }

  async function confirmGenerate() {
    if (!previewModal || !canWriteDB) return;
    try {
      setPreviewModal((p) => ({ ...p, generating: true }));
      await financeGateway.generateMonth({ ym });
      setPreviewModal(null);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
      setPreviewModal((p) => p && { ...p, generating: false });
    }
  }

  // Lembretes
  async function openReminderPreview() {
    setReminderModal({
      rows: [],
      busy: true,
      sending: false,
      selectedIds: new Set(),
      tplMap: null,
    });
    try {
      const eligible = (rows || [])
        .filter((r) => r.status === "pending")
        .map((r) => ({
          ...r,
          reminder_status: reminderStatus(r.due_date, r.status),
        }))
        .filter((r) => !!r.reminder_status);

      // Resolve emails (payer email > student email)
      const { supabase } = await import("@/lib/supabaseClient");
      const studentIds = [
        ...new Set(eligible.map((r) => r.student_id).filter(Boolean)),
      ];
      const payerIds = [
        ...new Set(eligible.map((r) => r.payer_id).filter(Boolean)),
      ];
      let students = [];
      if (studentIds.length) {
        const { data } = await supabase
          .from("students")
          .select("id,email,payer_id")
          .in("id", studentIds);
        students = data || [];
      }
      let payers = [];
      if (payerIds.length) {
        const { data } = await supabase
          .from("payers")
          .select("id,email")
          .in("id", payerIds);
        payers = data || [];
      }
      const emailByStudent = Object.create(null);
      const payerIdByStudent = Object.create(null);
      students.forEach((s) => {
        emailByStudent[s.id] = s.email || null;
        payerIdByStudent[s.id] = s.payer_id || null;
      });
      const emailByPayer = Object.create(null);
      payers.forEach((p) => {
        emailByPayer[p.id] = p.email || null;
      });

      const enriched = eligible.map((r) => {
        const pid = r.payer_id ?? payerIdByStudent[r.student_id] ?? null;
        const payerEmail = pid ? emailByPayer[pid] : null;
        const studentEmail = emailByStudent[r.student_id] ?? null;
        return {
          ...r,
          email_to: payerEmail || studentEmail || null,
          email_source: payerEmail
            ? "payer"
            : studentEmail
            ? "student"
            : null,
        };
      });

      const order = { Atrasado: 0, Vencido: 1, "A vencer": 2 };
      enriched.sort((a, b) => {
        const bs =
          (order[a.reminder_status] ?? 99) -
          (order[b.reminder_status] ?? 99);
        if (bs !== 0) return bs;
        return new Date(a.due_date) - new Date(b.due_date);
      });

      setReminderModal({
        rows: enriched,
        busy: false,
        sending: false,
        selectedIds: new Set(),
      });
    } catch (e) {
      setError(e?.message || String(e));
      setReminderModal(null);
    }
  }

  async function sendReminders({ onlySelected = false } = {}) {
    if (!reminderModal) return;
    const pool = onlySelected
      ? reminderModal.rows.filter((r) => reminderModal.selectedIds.has(r.id))
      : reminderModal.rows;
    const deliverables = pool.filter((r) => !!r.email_to);
    if (deliverables.length === 0) {
      alert("Nada para enviar (sem e-mails válidos).");
      return;
    }
    if (!confirm(`Enviar ${deliverables.length} lembrete(s) agora?`)) return;

    setReminderModal((m) => m && { ...m, sending: true });
    let ok = 0,
      fail = 0;

    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const statuses = [
        ...new Set(deliverables.map((r) => r.reminder_status).filter(Boolean)),
      ];
      const tplMap = new Map();
      const fetched = await Promise.all(
        statuses.map((s) => getTenantReminderTemplate(s))
      );
      statuses.forEach((s, i) => tplMap.set(s, fetched[i]));

      for (const r of deliverables) {
        const payload = buildReminderEmail(r, session, tplMap);
        const res = await fetch("/api/send-mail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        let providerId = null;
        let errorText = null;
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          providerId = data?.id ?? null;
          ok++;
        } else {
          errorText = await res.text().catch(() => "Mail provider error");
          fail++;
        }
        try {
          await supabase.from("finance_reminders_log").insert({
            tenant_id: session?.tenant?.id ?? session?.tenantId ?? null,
            payment_id: r.id ?? null,
            student_id: r.student_id ?? null,
            payer_id: r.payer_id ?? null,
            to_email: r.email_to ?? null,
            subject: payload.subject ?? null,
            provider: "mailgun",
            provider_id: providerId,
            status: res.ok ? "sent" : "error",
            error_text: errorText,
            payload,
            sent_at: res.ok ? new Date().toISOString() : null,
          });
        } catch {
          /* log opcional */
        }
      }
      const skipped = pool.length - deliverables.length;
      alert(`Lembretes: enviados ${ok}, falhas ${fail}, sem e-mail ${skipped}.`);
    } catch (e) {
      alert(`Erro ao enviar: ${e?.message || e}`);
    } finally {
      setReminderModal(null);
    }
  }

  // Filtragem cliente
  const today = new Date().toISOString().slice(0, 10);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (term) {
        const name = String(r.student_name || "").toLowerCase();
        if (!name.includes(term)) return false;
      }
      if (filter === "all") return true;
      if (filter === "paid") return r.status === "paid";
      if (filter === "canceled") return r.status === "canceled";
      if (filter === "pending")
        return (
          r.status === "pending" && (!r.due_date || r.due_date >= today)
        );
      if (filter === "overdue")
        return r.status === "pending" && r.due_date && r.due_date < today;
      return true;
    });
  }, [rows, q, filter, today]);

  // Export CSV
  function handleExport() {
    if (filtered.length === 0) return;
    const header = ["Aluno", "Vencimento", "Valor", "Pago em", "Status"];
    const data = filtered.map((r) => {
      let status = "Pendente";
      if (r.status === "paid") status = "Pago";
      else if (r.status === "canceled") status = "Cancelado";
      else if (r.due_date && String(r.due_date).slice(0, 10) < today)
        status = `Atraso ${r.days_overdue || 0}d`;
      return [
        r.student_name || "",
        r.due_date ? String(r.due_date).slice(0, 10) : "",
        Number(r.amount || 0).toFixed(2),
        r.paid_at ? String(r.paid_at).slice(0, 10) : "",
        status,
      ];
    });
    const csv = [header, ...data]
      .map((r) =>
        r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")
      )
      .join("\n");
    const bom = "﻿";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mensalidades-${ym}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Gates
  if (!ready || !permChecked) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[var(--p-text-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  if (!canReadDB) {
    return (
      <div className="space-y-2 p-6">
        <h1 className="text-xl font-semibold">Acesso negado</h1>
        <p className="text-sm text-[var(--p-text-muted)]">
          Você não tem permissão para visualizar o Financeiro desta escola.
        </p>
      </div>
    );
  }

  const totalRows = rows.reduce((a, r) => a + Number(r.amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Mensalidades
          </h1>
          <p className="mt-1 text-sm text-[var(--p-text-muted)]">
            {loading
              ? "Carregando…"
              : `${ymLabel(ym)} · ${rows.length} lançamentos · ${fmtBRL(totalRows)} no total`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWriteDB && (
            <button
              onClick={() => setBulkPayerOpen(true)}
              className="p-btn p-btn-ghost"
              title="Quitar todos os pendentes de um pagador no mês"
            >
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Receber de aluno</span>
            </button>
          )}
          {canWriteDB && (
            <button
              onClick={openPreview}
              className="p-btn p-btn-ghost"
              title="Prévia e geração de mensalidades do mês"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">Prévia & gerar</span>
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="p-btn p-btn-ghost"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <button
            onClick={openReminderPreview}
            className="p-btn p-btn-primary"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Lembretes</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <SumCard label="A receber" value={fmtBRL(revKpis.receita_a_receber)} />
        <SumCard
          label="Recebido"
          value={fmtBRL(revKpis.receita_recebida)}
          tone="success"
        />
        <SumCard
          label="Em atraso"
          value={fmtBRL(revKpis.receita_atrasada)}
          tone="danger"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--p-text-faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar aluno…"
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] py-2.5 pl-9 pr-3 text-sm placeholder:text-[var(--p-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm">
          <Calendar className="h-4 w-4 text-[var(--p-text-muted)]" />
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value.slice(0, 7))}
            className="bg-transparent text-sm focus:outline-none"
          />
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 min-w-max">
          {[
            { key: "all", label: "Todos" },
            { key: "pending", label: "Pendentes" },
            { key: "overdue", label: "Em atraso" },
            { key: "paid", label: "Pagos" },
            { key: "canceled", label: "Cancelados" },
          ].map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={[
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-[var(--p-primary)] text-white"
                    : "bg-[var(--p-surface)] border border-[var(--p-border)] text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]",
                ].join(" ")}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && canWriteDB && (
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--p-primary)]/30 bg-[var(--p-primary)]/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-medium">
            {selected.size}{" "}
            {selected.size === 1
              ? "mensalidade selecionada"
              : "mensalidades selecionadas"}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={bulkBusy}
              onClick={handleBulkMarkPaid}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--p-success)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--p-success)]/90 disabled:opacity-60"
            >
              {bulkBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Marcar como pago
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={handleBulkReopen}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--p-surface-2)] disabled:opacity-60"
            >
              <RotateCcw className="h-3 w-3" />
              Reabrir
            </button>
            <button
              type="button"
              disabled={bulkBusy}
              onClick={clearSelection}
              className="rounded-md px-2 py-1.5 text-xs text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] disabled:opacity-60"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          Erro: {error}
        </div>
      )}

      {/* Lista */}
      <div className="p-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-[var(--p-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-[var(--p-text-muted)]">
            Nenhuma mensalidade no filtro atual.
          </div>
        ) : (
          <>
            {/* Tabela desktop */}
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--p-border)] bg-[var(--p-surface-2)] text-left text-xs font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                    {canWriteDB && (
                      <th className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todas"
                          checked={
                            filtered.length > 0 &&
                            filtered.every((r) => selected.has(r.id))
                          }
                          onChange={() =>
                            toggleSelectAll(filtered.map((r) => r.id))
                          }
                          className="h-4 w-4 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="px-5 py-3">Aluno</th>
                    <th className="px-5 py-3">Vencimento</th>
                    <th className="px-5 py-3 text-right">Valor</th>
                    <th className="px-5 py-3">Pago em</th>
                    <th className="px-5 py-3">Status</th>
                    {canWriteDB && <th className="px-5 py-3"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--p-border)]">
                  {filtered.map((r) => {
                    const { cls, icon: Icon, label } = statusChip(r);
                    const isChecked = selected.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        className={`hover:bg-[var(--p-surface-2)] ${
                          isChecked ? "bg-[var(--p-primary)]/5" : ""
                        }`}
                      >
                        {canWriteDB && (
                          <td className="w-10 px-3 py-3">
                            <input
                              type="checkbox"
                              aria-label={`Selecionar ${r.student_name || r.id}`}
                              checked={isChecked}
                              onChange={() => toggleSelected(r.id)}
                              className="h-4 w-4 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="px-5 py-3 font-medium">
                          {r.student_name || "—"}
                        </td>
                        <td className="px-5 py-3 tabular-nums text-[var(--p-text-muted)]">
                          {fmtBRDate(r.due_date)}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold tabular-nums">
                          {fmtBRL(r.amount)}
                        </td>
                        <td className="px-5 py-3 tabular-nums text-[var(--p-text-muted)]">
                          {fmtBRDate(r.paid_at)}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`p-chip ${cls}`}>
                            <Icon className="h-3 w-3" /> {label}
                          </span>
                        </td>
                        {canWriteDB && (
                          <td className="px-5 py-3 text-right">
                            <RowActions
                              row={r}
                              busy={busyId === r.id}
                              onMarkPaid={() => markPaid(r.id)}
                              onReopen={() => reopen(r.id)}
                              onCancel={() => setCancelTarget(r)}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Lista mobile */}
            <ul className="divide-y divide-[var(--p-border)] md:hidden">
              {filtered.map((r) => {
                const { cls, icon: Icon, label } = statusChip(r);
                const isChecked = selected.has(r.id);
                return (
                  <li
                    key={r.id}
                    className={`flex items-start gap-3 px-4 py-3 ${
                      isChecked ? "bg-[var(--p-primary)]/5" : ""
                    }`}
                  >
                    {canWriteDB && (
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${r.student_name || r.id}`}
                        checked={isChecked}
                        onChange={() => toggleSelected(r.id)}
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">
                            {r.student_name || "—"}
                          </div>
                          <div className="text-xs text-[var(--p-text-muted)]">
                            Venc.: {fmtBRDate(r.due_date)}
                          </div>
                        </div>
                        <div className="flex items-start gap-2 shrink-0">
                          <div className="text-right">
                            <div className="text-sm font-semibold tabular-nums">
                              {fmtBRL(r.amount)}
                            </div>
                            <span className={`p-chip ${cls} mt-1`}>
                              <Icon className="h-3 w-3" /> {label}
                            </span>
                          </div>
                          {canWriteDB && (
                            <RowActions
                              row={r}
                              busy={busyId === r.id}
                              onMarkPaid={() => markPaid(r.id)}
                              onReopen={() => reopen(r.id)}
                              onCancel={() => setCancelTarget(r)}
                            />
                          )}
                        </div>
                      </div>
                      {r.paid_at && (
                        <div className="mt-1 text-[11px] text-[var(--p-text-faint)]">
                          Pago em {fmtBRDate(r.paid_at)}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Modal: Prévia & Gerar */}
      {previewModal && (
        <AppModal
          title={`Prévia · ${ymLabel(ym)}`}
          onClose={
            previewModal.generating ? () => {} : () => setPreviewModal(null)
          }
          maxWidth="lg"
        >
          <div className="flex flex-col gap-4 px-5 py-5">
            {previewModal.items.length === 0 ? (
              <p className="text-sm text-[var(--p-text-muted)]">
                Nada a gerar — todas as mensalidades já existem para este mês.
              </p>
            ) : (
              <>
                <p className="text-sm text-[var(--p-text-muted)]">
                  As seguintes mensalidades serão geradas:
                </p>
                <ul className="max-h-72 overflow-y-auto rounded-lg border border-[var(--p-border)] divide-y divide-[var(--p-border)]">
                  {previewModal.items.map((p, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {p.student_name}
                        </div>
                        <div className="text-xs text-[var(--p-text-muted)]">
                          Vence {fmtBRDate(p.due_date)} · {p.payer_name}
                        </div>
                      </div>
                      <div className="text-sm font-semibold tabular-nums">
                        {fmtBRL(p.amount)}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                disabled={previewModal.generating}
                className="p-btn p-btn-ghost"
              >
                Fechar
              </button>
              {previewModal.items.length > 0 && (
                <button
                  type="button"
                  onClick={confirmGenerate}
                  disabled={previewModal.generating}
                  className="p-btn p-btn-primary"
                >
                  {previewModal.generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Gerando…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Gerar{" "}
                      {previewModal.items.length}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </AppModal>
      )}

      {/* Modal: Lembretes */}
      {reminderModal && (
        <ReminderModal
          state={reminderModal}
          isAdmin={isAdmin}
          onChange={(patch) =>
            setReminderModal((m) => m && { ...m, ...patch })
          }
          onClose={() => setReminderModal(null)}
          onSendAll={() => sendReminders({ onlySelected: false })}
          onSendSelected={() => sendReminders({ onlySelected: true })}
        />
      )}

      {/* Modal: Receber de um aluno (bulk pay by payer) */}
      {bulkPayerOpen && canWriteDB && (
        <BulkPayByPayerModal
          ym={ym}
          onClose={() => setBulkPayerOpen(false)}
          onDone={async () => {
            setBulkPayerOpen(false);
            await load();
          }}
        />
      )}

      {/* Modal: Cancelar */}
      {cancelTarget && (
        <CancelPaymentModal
          row={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirm={async (note) => {
            const id = cancelTarget.id;
            setCancelTarget(null);
            await doCancel(id, note);
          }}
        />
      )}
    </div>
  );
}

// ─── Componentes auxiliares ──────────────────────────────────────
function SumCard({ label, value, tone }) {
  const toneCls =
    tone === "success"
      ? "text-[var(--p-success)]"
      : tone === "danger"
      ? "text-[var(--p-danger)]"
      : "text-[var(--p-text)]";
  return (
    <div className="p-card p-4">
      <div className="text-xs uppercase tracking-wider text-[var(--p-text-faint)]">
        {label}
      </div>
      <div className={`p-kpi-value mt-1 text-lg md:text-xl ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}

function RowActions({ row, busy, onMarkPaid, onReopen, onCancel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const canMarkPaid = row.status === "pending";
  const canReopenAct = row.status === "paid" || row.status === "canceled";
  const canCancelAct = row.status !== "canceled";

  function run(fn) {
    setOpen(false);
    fn();
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1.5 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)] disabled:opacity-50"
        aria-label="Ações"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MoreHorizontal className="h-4 w-4" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] shadow-lg">
          {canMarkPaid && (
            <button
              type="button"
              onClick={() => run(onMarkPaid)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--p-surface-2)]"
            >
              <Check className="h-4 w-4 text-[var(--p-success)]" /> Marcar
              como pago
            </button>
          )}
          {canReopenAct && (
            <button
              type="button"
              onClick={() => run(onReopen)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--p-surface-2)]"
            >
              <RotateCcw className="h-4 w-4 text-[var(--p-text-muted)]" />{" "}
              Reabrir
            </button>
          )}
          {canCancelAct && (
            <button
              type="button"
              onClick={() => run(onCancel)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--p-danger)] hover:bg-[var(--p-danger-50)]"
            >
              <XCircle className="h-4 w-4" /> Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal: Lembretes ────────────────────────────────────────────
function ReminderModal({ state, isAdmin, onChange, onClose, onSendAll, onSendSelected }) {
  function toggleSelect(id) {
    onChange({
      selectedIds: (() => {
        const next = new Set(state.selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      })(),
    });
  }
  function selectAllVisible(flag) {
    onChange({
      selectedIds: flag ? new Set(state.rows.map((r) => r.id)) : new Set(),
    });
  }

  return (
    <AppModal title="Prévia de lembretes" onClose={onClose} maxWidth="3xl">
      <div className="flex flex-col gap-4 px-5 py-5">
        {state.busy ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[var(--p-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : state.rows.length === 0 ? (
          <div className="text-sm text-[var(--p-text-muted)]">
            Nenhum aluno com cobrança atrasada, vencendo hoje ou nos próximos
            7 dias.
          </div>
        ) : (
          <>
            {isAdmin && (
              <a
                href="/conta#equipe"
                className="text-xs text-[var(--p-text-muted)] underline"
              >
                Configurar templates de e-mail do tenant
              </a>
            )}

            {/* Resumo */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {["Atrasado", "Vencido", "A vencer"].map((tag) => {
                const n = state.rows.filter(
                  (r) => r.reminder_status === tag
                ).length;
                return (
                  <span key={tag} className="p-chip p-chip-neutral">
                    <b>{tag}:</b> {n}
                  </span>
                );
              })}
              <span className="p-chip p-chip-warning">
                Sem e-mail:{" "}
                {state.rows.filter((r) => !r.email_to).length}
              </span>
            </div>

            {/* Barra de seleção */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => selectAllVisible(true)}
                  className="text-xs text-[var(--p-primary)] hover:underline"
                >
                  Selecionar todos
                </button>
                <button
                  type="button"
                  onClick={() => selectAllVisible(false)}
                  className="text-xs text-[var(--p-text-muted)] hover:underline"
                >
                  Limpar
                </button>
                <span className="text-xs text-[var(--p-text-faint)]">
                  Selecionados: {state.selectedIds.size}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onSendSelected}
                  disabled={state.sending || state.selectedIds.size === 0}
                  className="p-btn p-btn-ghost text-xs"
                >
                  {state.sending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                  Enviar selecionados
                </button>
                <button
                  type="button"
                  onClick={onSendAll}
                  disabled={state.sending || state.rows.length === 0}
                  className="p-btn p-btn-primary text-xs"
                >
                  {state.sending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                  Enviar todos
                </button>
              </div>
            </div>

            {/* Tabela */}
            <div className="overflow-auto rounded-lg border border-[var(--p-border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--p-surface-2)] text-xs font-medium uppercase tracking-wider text-[var(--p-text-muted)]">
                  <tr>
                    <th className="w-10 px-3 py-2"></th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Aluno</th>
                    <th className="px-3 py-2 text-left">Vencimento</th>
                    <th className="px-3 py-2 text-left">E-mail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--p-border)]">
                  {state.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={state.selectedIds.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={`p-chip ${
                            r.reminder_status === "Atrasado"
                              ? "p-chip-danger"
                              : r.reminder_status === "Vencido"
                              ? "p-chip-warning"
                              : "p-chip-neutral"
                          }`}
                        >
                          {r.reminder_status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {r.student_name_snapshot || r.student_name || "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--p-text-muted)]">
                        {fmtBRDate(r.due_date)}
                      </td>
                      <td className="px-3 py-2">
                        {r.email_to ? (
                          <span>
                            {r.email_to}
                            <span className="ml-2 text-[10px] text-[var(--p-text-faint)]">
                              ({r.email_source === "payer" ? "pagador" : "aluno"})
                            </span>
                          </span>
                        ) : (
                          <span className="text-[var(--p-danger)] text-xs">
                            sem e-mail
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex justify-end">
          <button onClick={onClose} className="p-btn p-btn-ghost">
            Fechar
          </button>
        </div>
      </div>
    </AppModal>
  );
}

// ─── Modal: Cancelar ─────────────────────────────────────────────
function CancelPaymentModal({ row, onClose, onConfirm }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <AppModal title="Cancelar mensalidade" onClose={onClose} maxWidth="sm">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onConfirm(note);
        }}
        className="flex flex-col gap-4 px-5 py-5"
      >
        <p className="text-sm text-[var(--p-text-muted)]">
          Cancelar a mensalidade de{" "}
          <span className="font-medium text-[var(--p-text)]">
            {row.student_name || "—"}
          </span>{" "}
          no valor de{" "}
          <span className="font-medium text-[var(--p-text)]">
            {fmtBRL(row.amount)}
          </span>
          ?
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Motivo (opcional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
          />
        </label>
        <ModalActions
          onCancel={onClose}
          submitting={busy}
          submitLabel="Cancelar mensalidade"
        />
      </form>
    </AppModal>
  );
}

// ─── Modal: Receber de um aluno (Bulk Pay by Payer) ──────────────
function BulkPayByPayerModal({ ym, onClose, onDone }) {
  const [payerOptions, setPayerOptions] = useState([]);
  const [payerId, setPayerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [resultMsg, setResultMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { supabase } = await import("@/lib/supabaseClient");
        let q1 = await supabase
          .from("payers")
          .select("id, name")
          .order("name", { ascending: true });
        let payers = [];
        if (q1.error) {
          const q2 = await supabase
            .from("payers")
            .select("id, full_name")
            .order("full_name", { ascending: true });
          payers = q2.data || [];
        } else {
          payers = q1.data || [];
        }
        if (!alive) return;
        const opts = (payers || [])
          .map((p) => ({
            value: p.id,
            label:
              p.name ?? p.full_name ?? `Pagador ${String(p.id).slice(0, 6)}`,
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
        setPayerOptions(opts);
      } catch (e) {
        if (alive) setErr(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function confirmBulkPay() {
    if (!payerId) {
      setErr("Selecione um pagador.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const { start, end } = monthRange(ym);
      const { data, error: qErr, count } = await supabase
        .from("payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("payer_id", payerId)
        .eq("status", "pending")
        .gte("due_date", start)
        .lt("due_date", end)
        .select("id", { count: "exact" });
      if (qErr) throw qErr;
      const n = count ?? (Array.isArray(data) ? data.length : 0);
      setResultMsg(`${n} mensalidade(s) marcada(s) como paga(s).`);
      setTimeout(async () => {
        await onDone?.();
      }, 800);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppModal
      title="Receber de um aluno"
      onClose={busy ? () => {} : onClose}
      maxWidth="lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          confirmBulkPay();
        }}
        className="flex flex-col gap-4 px-5 py-5"
      >
        <FormError message={err} />
        {resultMsg && (
          <div className="rounded-lg border border-[var(--p-success)]/30 bg-[var(--p-success-50)] px-3 py-2 text-xs text-[var(--p-success)]">
            {resultMsg}
          </div>
        )}
        <p className="text-sm text-[var(--p-text-muted)]">
          Todos os pagamentos pendentes deste pagador no mês ({ymLabel(ym)})
          serão marcados como pagos.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--p-text-muted)]">
            Pagador *
          </span>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-[var(--p-text-muted)]">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
            </div>
          ) : (
            <select
              value={payerId}
              onChange={(e) => setPayerId(e.target.value)}
              className="w-full rounded-lg border border-[var(--p-border)] bg-[var(--p-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--p-primary)]/20 focus:border-[var(--p-primary)]/40"
            >
              <option value="">Selecione…</option>
              {payerOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </label>
        <ModalActions
          onCancel={onClose}
          submitting={busy}
          submitLabel="Confirmar pagamento"
        />
      </form>
    </AppModal>
  );
}

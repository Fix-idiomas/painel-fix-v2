import { supabase } from "../supabaseClient";
import type { MeetingRule, RecurrenceTemplate } from "@/types";

// ------------------------ Error mapping ------------------------
export const mapErr = (ctx: string, err: unknown): never => {
  const e = err as Record<string, unknown>;
  const code = e?.code || e?.status || e?.name;
  const text = `${e?.message || ""} ${e?.details || ""}`.toLowerCase();

  if (
    code === "23502" ||
    (text as string).includes("null value in column") ||
    (text as string).includes("violates not-null constraint")
  ) {
    if ((text as string).includes("teacher_id_snapshot")) {
      console.error(`[supabaseGateway] ${ctx}:`, err);
      throw new Error("É obrigatório atribuir um professor à turma para criar uma sessão.");
    }
  }

  console.error(`[supabaseGateway] ${ctx}:`, e?.message || err);
  throw new Error((e?.message as string) || `Erro em ${ctx}`);
};

// Normaliza meeting_rules para manter shape consistente
export function normalizeRules(rules: unknown): MeetingRule[] {
  const arr = Array.isArray(rules) ? rules : [];
  return arr.map((r) => ({
    weekday: (r?.weekday === 0 || r?.weekday) ? Number(r.weekday) : null,
    time: r?.time || null,
    duration_hours: Number(r?.duration_hours ?? 0.5),
  }));
}

// Datas úteis locais
export const monthStartOf = (ym?: string | null): string => {
  if (!ym || typeof ym !== "string" || ym.length < 7) {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  const base = ym.length === 7 ? `${ym}-01` : ym.slice(0, 10);
  const [Y, M] = base.slice(0, 7).split("-");
  return `${Y}-${M}-01`;
};

export const clampDay1to28 = (n: unknown): number =>
  Math.min(Math.max(Number(n || 5), 1), 28);

export const dueDateFor = (ym: string, due_day: unknown): string => {
  const base = monthStartOf(ym);
  const [Y, M] = base.split("-").map(Number);
  const d = clampDay1to28(due_day);
  return `${Y}-${String(M).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

// Sessão autenticada disponível?
export async function hasAuthSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return !!data?.session?.access_token;
  } catch {
    return false;
  }
}

// Diferença em meses inteiros entre dois "YYYY-MM-01" (b - a)
export function monthsBetween(
  a: string | null | undefined,
  b: string | null | undefined
): number | null {
  if (!a || !b) return null;
  const [Ya, Ma] = a.slice(0, 7).split("-").map(Number);
  const [Yb, Mb] = b.slice(0, 7).split("-").map(Number);
  return (Yb - Ya) * 12 + (Mb - Ma);
}

// Verifica se um template está ativo para um determinado mês de competência
export function isRecurrenceActiveForMonth(
  t: RecurrenceTemplate,
  monthStart: string
): boolean {
  const mode = String(t?.recurrence_mode || "indefinite");
  const start = t?.start_month ? monthStartOf(String(t.start_month)) : null;
  const end = t?.end_month ? monthStartOf(String(t.end_month)) : null;
  const inst = (t?.installments ?? null) != null ? Number(t.installments) : null;

  if (start && monthStart < start) return false;

  if (mode === "installments") {
    if (!inst || inst < 1) return true;
    if (!start) return true;
    const diff = monthsBetween(start, monthStart);
    if (diff == null || diff < 0) return false;
    return diff < inst;
  }

  if (mode === "until_month") {
    if (end && monthStart > end) return false;
    return true;
  }

  return true;
}

// Retorna "YYYY-MM-DD" no fuso America/Sao_Paulo
export function tzToday(tz = "America/Sao_Paulo"): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const Y = parts.find((p) => p.type === "year")?.value;
  const M = parts.find((p) => p.type === "month")?.value;
  const D = parts.find((p) => p.type === "day")?.value;
  return `${Y}-${M}-${D}`;
}

// +N dias em "YYYY-MM-DD"
export function addDaysISO(ymd: string, n = 0): string {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  const Y = d.getUTCFullYear();
  const M = String(d.getUTCMonth() + 1).padStart(2, "0");
  const D = String(d.getUTCDate()).padStart(2, "0");
  return `${Y}-${M}-${D}`;
}

// Converte "YYYY-MM-DD" (ou com hora) para ISO (timestamptz)
export function toIsoTz(dateStr: unknown): string | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();

  if (s.length > 10) {
    const dFull = new Date(s);
    if (isNaN(dFull.getTime())) return null;
    return dFull.toISOString();
  }

  const [Y, M, D] = s.split("-").map(Number);
  const d = new Date(Y, (M || 1) - 1, D || 1, 0, 0, 0);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

// normaliza 'DD/MM/YYYY' ou 'DD.MM.YYYY' para 'YYYY-MM-DD'
export function normalizeDate(s: unknown): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (/^\d{2}[./]\d{2}[./]\d{4}$/.test(t)) {
    const [dd, mm, yyyy] = t.split(/[./]/);
    return `${yyyy}-${mm}-${dd}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return t.slice(0, 10);
}

// helper para obter tenant_id do contexto RLS
export async function getTenantId(): Promise<string> {
  const { data, error } = await supabase.rpc("current_tenant_id");
  if (error || !data) throw new Error("tenant_id indisponível no contexto");
  return data as string;
}

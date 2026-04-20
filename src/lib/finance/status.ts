import { todayISO } from "./dates";

interface StatusRow {
  status?: string | null;
  due_date?: string | null;
}

export function getPaymentStatusLabel(
  row: StatusRow | null | undefined,
  tz: string = "America/Sao_Paulo",
): string {
  if (!row) return "";
  if (row.status === "paid") return "Pago";
  if (row.status === "canceled") return "Cancelado";
  if (row.status === "pending") {
    const today = todayISO(tz);
    const due = row.due_date;
    if (due && today && due < today) return "Atrasado";
    return "A Vencer";
  }
  return row.status ?? "";
}

export function isOverdue(
  row: StatusRow | null | undefined,
  tz: string = "America/Sao_Paulo",
): boolean {
  if (!row || row.status !== "pending") return false;
  const today = todayISO(tz);
  return !!(row.due_date && today && row.due_date < today);
}

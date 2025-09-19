import { todayISO } from "./dates";

export function getPaymentStatusLabel(row, tz = "America/Sao_Paulo") {
  if (!row) return "";
  if (row.status === "paid") return "Pago";
  if (row.status === "canceled") return "Cancelado";
  if (row.status === "pending") {
    const today = todayISO(tz);
    const due = row.due_date;
    if (due && due < today) return "Atrasado";
    return "A Vencer";
  }
  return row.status ?? "";
}

export function isOverdue(row, tz = "America/Sao_Paulo") {
  if (!row || row.status !== "pending") return false;
  const today = todayISO(tz);
  return row.due_date && row.due_date < today;
}

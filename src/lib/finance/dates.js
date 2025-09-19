export function toISODate(d) {
  if (!d) return null;
  const dt = (d instanceof Date) ? d : new Date(`${d}T00:00:00`);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function firstDayOfYm(ym) {
  // ym: "YYYY-MM"
  const [y, m] = ym.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

export function isSameYm(dateISO, ym) {
  if (!dateISO) return false;
  const [y, m] = dateISO.split("-").map(Number);
  const [yy, mm] = ym.split("-").map(Number);
  return y === yy && m === mm;
}

export function todayISO(tz = "America/Sao_Paulo") {
  // simplificado: usa timezone do ambiente + meia-noite
  const now = new Date();
  return toISODate(now);
}

// "Hoje" e "mês atual" no fuso de São Paulo — puro, sem dependências (pode ser
// usado em páginas, gateways e rotas de servidor).
//
// Auditoria M1: `new Date().toISOString().slice(0, 10)` dá a data em UTC; depois
// das 21h de Brasília isso já é o dia seguinte (atrasos contavam um dia a mais,
// o seletor de mês pulava para o próximo no último dia do mês à noite).

export const SP_TZ = "America/Sao_Paulo";

// "YYYY-MM-DD" do instante informado (padrão: agora), no fuso de SP.
export function todaySP(at: string | number | Date = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(at));
  const g = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

// "YYYY-MM" do instante informado (padrão: agora), no fuso de SP.
export function currentMonthSP(at: string | number | Date = Date.now()): string {
  return todaySP(at).slice(0, 7);
}

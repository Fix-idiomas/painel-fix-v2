// components/WeekGrid.jsx
import React from "react";

// --- utils ---
const toMinutes = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// faixa e resolução (30 em 30)
const START_MIN = 7 * 60;   // 07:00
const END_MIN   = 22 * 60;  // 22:00
const SLOT_MIN  = 30;       // 30 minutos

// calcula posição/altura do bloco em %
function blockStyle(hhmm, durationMin = 60) {
  const t = toMinutes(hhmm);
  const clampedTop = Math.max(START_MIN, Math.min(t, END_MIN));
  const total = END_MIN - START_MIN;
  // Espaçamento extra em px (topo/base)
  const paddingPx = 4;
  // Altura do container em px (usado para calcular % do padding)
  const containerPx = (SLOT_MIN * ((END_MIN - START_MIN) / SLOT_MIN + 1)) * (32 / 30); // 32px por slot (aprox)
  const paddingPct = (paddingPx / containerPx) * 100;
  const topPct = ((clampedTop - START_MIN) / total) * 100 + paddingPct;
  const hPct = Math.max(2, (durationMin / total) * 100 - 2 * paddingPct);
  return { top: `${topPct}%`, height: `${hPct}%` };
}

// helpers fuso São Paulo
// Formata data para DD.MM (sem ano)
const fmtBRDateDots = (ymd) => {
  const [ano, mes, dia] = ymd.split("-");
  return `${dia}.${mes}`;
};
const todayYMD = (() => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
})();

const nowHHMM = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date()); // HH:MM

const weekdayShort = (ymd) => {
  const d = new Date(`${ymd}T00:00:00`);
  return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d.getDay()];
};
const weekdayLong = (ymd) => {
  const d = new Date(`${ymd}T00:00:00`);
  return ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][d.getDay()];
};
function WeekGrid({ days, events, onOpen }) {
  // days: array "YYYY-MM-DD" (Seg→Sáb)
  // events: [{ id, turma_name, turma_id, date(ISO), hhmm, duration_min, type, has_attendance }]
  // onOpen(ev): handler ao clicar no card

  // quantos slots de 30 minutos cabem na janela (incluindo borda final)
  const SLOTS = (END_MIN - START_MIN) / SLOT_MIN + 1;

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      {/* Cabeçalho (datas + dia da semana) */}
      <div
        className="grid border-b"
        style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}
      >
  <div className="bg-white" />
        {days.map((ymd) => (
          <div key={`hd-${ymd}`} className="px-3 py-2 border-l">
            <div className="text-lg font-semibold">
              {weekdayLong(ymd)}
            </div>
            <div className="text-sm font-semibold">
              {fmtBRDateDots(ymd)}
            </div>
          </div>
        ))}
      </div>

      {/* Corpo: colunas + linhas de 30min */}
      <div className="relative bg-white">
        <div
          className="grid"
          style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}
        >
          {/* Coluna de horários (labels a cada 30min) */}
          <div className="relative bg-white">
            {Array.from({ length: SLOTS }).map((_, i) => {
              const minutes = START_MIN + i * SLOT_MIN;
              const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
              const mm = String(minutes % 60).padStart(2, "0");
              const isHour = mm === "00";
              return (
                <div
                  key={`hl-${i}`}
                  className={`h-8 flex items-center justify-center text-[11px] ${
                    isHour ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  {`${hh}:${mm}`}
                </div>
              );
            })}
          </div>

          {/* Colunas dos dias */}
          {days.map((ymd) => {
            const isTodayCol = ymd === todayYMD;
            return (
              <div key={`col-${ymd}`} className="relative border-l">
                {/* realce do dia atual */}
                {isTodayCol && (
                  <div className="absolute inset-0 bg-amber-50/60 pointer-events-none" />
                )}

                {/* linhas horizontais a cada 30min (hora mais forte) */}
                {Array.from({ length: SLOTS }).map((_, i) => {
                  const minutes = START_MIN + i * SLOT_MIN;
                  const mm = String(minutes % 60).padStart(2, "0");
                  const isHour = mm === "00";
                  return (
                    <div
                      key={`gl-${ymd}-${i}`}
                      className={`h-8 border-t ${
                        isHour ? "border-slate-300" : "border-slate-100"
                      }`}
                    />
                  );
                })}

                {/* eventos do dia */}
                <div className="absolute left-1 right-1 top-1 bottom-1 pointer-events-none">
                  {events
                    .filter((ev) => String(ev.date).slice(0, 10) === ymd)
                    .map((ev, idx) => {
                      const style = blockStyle(ev.hhmm, ev.duration_min || 60);

                      const hasAtt =
                        ev.has_attendance === true ||
                        ev.has_attendance === "true" ||
                        ev.has_attendance === "t" ||
                        ev.has_attendance === 1;

                      const evDay = String(ev.date).slice(0, 10);
                      const hhmm = ev.hhmm || "00:00";
                      const isPast =
                        evDay < todayYMD ||
                        (evDay === todayYMD && hhmm < nowHHMM);

                      // cores (prioridade): concluída > atrasada > hoje > futura/planejada
                      let base = "border-sky-300 bg-sky-50"; // padrão (azul: planejada/futura)
                      if (evDay === todayYMD) base = "border-amber-300 bg-amber-50"; // hoje
                      if (isPast) base = "border-rose-300 bg-rose-50"; // atrasada
                      if (hasAtt) base = "border-emerald-300 bg-emerald-50"; // concluída

                      const key = `ev-${ymd}-${ev.id ?? ""}-${ev.turma_id ?? ""}-${
                        ev.hhmm ?? ""
                      }-${idx}`;

                      return (
                        <button
                          type="button"
                          key={key}
                          onClick={() => onOpen?.(ev)}
                          className={`absolute left-1 right-1 z-10 cursor-pointer pointer-events-auto border rounded px-2 py-1 text-xs text-left shadow-sm hover:shadow mt-1 mb-1 ${base}`}
                          style={style}
                          title={ev.turma_name}
                        >
                          <div className="font-medium truncate">
                            {ev.turma_name}
                          </div>
                          {/* horário oculto por opção de layout */}
                        </button>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default WeekGrid;

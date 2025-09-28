// components/WeekGrid.jsx
import React from "react";

// util — retorna "HH:MM" -> minutos desde 00:00
const toMinutes = (hhmm) => {
  if (!hhmm) return 0;
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

// faixa de horas visível (ajuste se quiser)
const START_MIN = 7 * 60;   // 07:00
const END_MIN   = 19 * 60;  // 19:00
const SLOT_MIN  = 30;       // resolução vertical

// calcula top/heighta em %
function blockStyle(hhmm, durationMin = 60) {
  const t = toMinutes(hhmm);
  const clampedTop = Math.max(START_MIN, Math.min(t, END_MIN));
  const total = END_MIN - START_MIN;
  const topPct = ((clampedTop - START_MIN) / total) * 100;
  const hPct = Math.max(2, (durationMin / total) * 100);
  return { top: `${topPct}%`, height: `${hPct}%` };
}

// helpers de data/hora no fuso de São Paulo
const todayYMD = (() => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
})();
const nowHHMM = (() => {
  // 24h
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date()); // HH:MM
})();
const weekdayShort = (ymd) => {
  const d = new Date(`${ymd}T00:00:00`);
  return ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][d.getDay()];
};

function WeekGrid({ days, events, fmtBRDateDots, onOpen }) {
  // days: array de 7 strings "YYYY-MM-DD" (Seg→Dom)
  // events: array normalizado com { id, turma_name, date (ISO), hhmm, duration_min, type, has_attendance }
  // onOpen: (ev) => void

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: "80px repeat(7, 1fr)" }}>
        <div className="bg-white" />
        {days.map((ymd) => (
          <div key={`hd-${ymd}`} className="px-2 py-2 border-l">
            <div className="text-sm font-medium">
              {typeof fmtBRDateDots === "function" ? fmtBRDateDots(ymd) : ymd}
            </div>
            <div className="text-[11px] uppercase text-slate-400">
              ({weekdayShort(ymd)})
            </div>
          </div>
        ))}
      </div>

      {/* Corpo: linhas de tempo + colunas */}
      <div className="relative">
        <div className="grid" style={{ gridTemplateColumns: "80px repeat(7, 1fr)" }}>
          {/* Coluna de horários */}
          <div className="relative">
            {Array.from({ length: (END_MIN - START_MIN) / SLOT_MIN + 1 }).map((_, i) => {
              const minutes = START_MIN + i * SLOT_MIN;
              const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
              const mm = String(minutes % 60).padStart(2, "0");
              return (
                <div
                  key={`hl-${i}`}
                  className="h-10 text-[11px] text-slate-500 pr-2 flex items-start justify-end"
                >
                  {mm === "00" ? `${hh}:00` : ""}
                </div>
              );
            })}
          </div>

          {/* Colunas dos dias */}
          {days.map((ymd) => (
            <div key={`col-${ymd}`} className="relative border-l">
              {/* linhas horizontais */}
              {Array.from({ length: (END_MIN - START_MIN) / SLOT_MIN + 1 }).map((_, i) => (
                <div key={`gl-${ymd}-${i}`} className="h-10 border-t border-slate-100" />
              ))}

              {/* eventos do dia */}
              <div className="absolute inset-0 pointer-events-none">
                {events
                  .filter((ev) => String(ev.date).slice(0, 10) === ymd)
                  .map((ev, idx) => {
                    const style = blockStyle(ev.hhmm, ev.duration_min || 60);
                    const hasAtt =
                      ev.has_attendance === true ||
                      ev.has_attendance === "true" ||
                      ev.has_attendance === "t" ||
                      ev.has_attendance === 1;
                    // atraso: sem presença e já passou do horário (no dia anterior ou hoje com HH:MM < agora)
                    const evDay = String(ev.date).slice(0, 10);
                    const hhmm = ev.hhmm || "00:00";
                    const isPast =
                      evDay < todayYMD || (evDay === todayYMD && hhmm < nowHHMM);
                    // prioridade de cor: concluída (verde) > atrasada (vermelho) > hoje (amarelo) > futura/planejada (azul)
                    let base =
                      "border-sky-300 bg-sky-50"; // azul
                    if (evDay === todayYMD) base = "border-amber-300 bg-amber-50"; // amarelo
                    if (isPast) base = "border-rose-300 bg-rose-50"; // vermelho
                    if (hasAtt) base = "border-emerald-300 bg-emerald-50"; // verde

                    const key = `ev-${ymd}-${ev.id ?? ""}-${ev.turma_id ?? ""}-${ev.hhmm ?? ""}-${idx}`;
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => onOpen?.(ev)}
                        className={`absolute left-1 right-1 z-10 cursor-pointer pointer-events-auto border rounded px-2 py-1 text-xs text-left shadow-sm hover:shadow ${base}`}
                        style={style}
                       title={ev.turma_name}
                      >
                        <div className="font-medium truncate">{ev.turma_name}</div>
                        {/* sem horário visível */}
                      </button>
                    );
                  })}              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default WeekGrid;

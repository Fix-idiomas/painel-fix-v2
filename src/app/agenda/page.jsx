// src/app/agenda/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { financeGateway } from "@/lib/financeGateway";

// Segunda como início de semana
const startOfWeek = (d) => {
  const date = new Date(d);
  const day = date.getDay(); // 0..6 (0=domingo)
  const diff = (day === 0 ? -6 : 1) - day; // move para segunda
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const fmtDateISO = (d) => d.toISOString().slice(0, 10);
const fmtBRDateTime = (isoDate, time) => {
  if (!isoDate) return "-";
  try {
    const [h = "00", m = "00"] = (time || "00:00").split(":");
    const dt = new Date(`${isoDate}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:00`);
    const dia = dt.toLocaleDateString("pt-BR");
    const hora = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${dia} às ${hora}`;
  } catch {
    return new Date(isoDate + "T00:00:00").toLocaleDateString("pt-BR");
  }
};

// Constrói ocorrências planejadas da semana a partir da turma
function buildPlannedOccurrencesForWeek(turma, weekStartISO) {
  const weekStart = new Date(weekStartISO + "T00:00:00");
  const occurrences = [];

  const pushOcc = (weekday, time, duration) => {
    if (weekday == null || time == null || time === "") return;
    const wd = Number(weekday); // 0..6 (0=domingo)
    const jsWeekDayMon0 = (wd === 0 ? 6 : wd - 1); // seg=0,...,dom=6
    const occDate = fmtDateISO(addDays(weekStart, jsWeekDayMon0));
    occurrences.push({
      type: "planned",
      turma_id: turma.id,
      turma_name: turma.name,
      teacher_id: turma.teacher_id || null,
      date: occDate,
      time,
      duration_hours: Number(duration || 0.5),
    });
  };

  // Nova grade com múltiplos horários
  if (Array.isArray(turma.schedule) && turma.schedule.length > 0) {
    for (const item of turma.schedule) {
      const weekday = item?.weekday;
      const time = item?.time;
      const dur = item?.duration_hours ?? turma.meeting_duration_default ?? 0.5;

      const activeFrom = item?.active_from || null;
      const activeTo = item?.active_to || null;

      const weekEndISO = fmtDateISO(addDays(weekStart, 6));
      const afterStart = !activeFrom || weekEndISO >= activeFrom;
      const beforeEnd = !activeTo || weekStartISO <= activeTo;
      if (afterStart && beforeEnd) pushOcc(weekday, time, dur);
    }
    return occurrences;
  }

  // Legado (um dia/hora)
  if (turma.meeting_day != null && turma.meeting_time) {
    pushOcc(turma.meeting_day, turma.meeting_time, turma.meeting_duration_default ?? 0.5);
  }
  return occurrences;
}

export default function AgendaPage() {
  const [view, setView] = useState("today"); // "today" | "week"
  const [weekStart, setWeekStart] = useState(() => fmtDateISO(startOfWeek(new Date())));
  const [teacherFilter, setTeacherFilter] = useState("all"); // "all" | teacher_id
  const [includeSessions, setIncludeSessions] = useState(false); // por padrão só previstas

  const [loading, setLoading] = useState(true);
  const [turmas, setTurmas] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [sessionsByTurma, setSessionsByTurma] = useState({});

  const weekDays = useMemo(() => {
    const base = new Date(weekStart + "T00:00:00");
    return Array.from({ length: 7 }).map((_, i) => {
      const d = addDays(base, i);
      return { iso: fmtDateISO(d), label: d.toLocaleDateString("pt-BR") };
    });
  }, [weekStart]);

  const todayISO = useMemo(() => fmtDateISO(new Date()), []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [ts, ths] = await Promise.all([
        financeGateway.listTurmas(),
        financeGateway.listTeachers(),
      ]);

      // pega sessões reais da semana (se quiser incluir depois)
      const monday = new Date(weekStart + "T00:00:00");
      const sundayISO = fmtDateISO(addDays(monday, 6));

      const perTurma = {};
      for (const t of ts) {
        const sess = await financeGateway.listSessions(t.id);
        perTurma[t.id] = sess.filter((s) => s.date >= weekStart && s.date <= sundayISO);
      }

      setTurmas(ts);
      setTeachers(ths);
      setSessionsByTurma(perTurma);
      setLoading(false);
    })();
  }, [weekStart]);

  const teacherName = (id) => teachers.find((t) => t.id === id)?.name || "—";

  // Monta agenda da semana (previstas +, opcionalmente, registradas)
  const agendaByDay = useMemo(() => {
    // Planejadas (sempre)
    let planned = turmas.flatMap((t) => buildPlannedOccurrencesForWeek(t, weekStart));

    // Filtra por professor (se escolhido)
    if (teacherFilter !== "all") {
      planned = planned.filter((ev) => ev.teacher_id === teacherFilter);
    }

    let combined = planned;

    // Se marcar "incluir sessões", acrescenta
    if (includeSessions) {
      let real = turmas.flatMap((t) =>
        (sessionsByTurma[t.id] || []).map((s) => ({
          type: "session",
          turma_id: t.id,
          turma_name: t.name,
          teacher_id: t.teacher_id || null,
          date: s.date,
          time: null,
          duration_hours: Number(s.duration_hours || 0),
          notes: s.notes || "",
        }))
      );
      if (teacherFilter !== "all") {
        real = real.filter((ev) => ev.teacher_id === teacherFilter);
      }
      combined = [...planned, ...real];
    }

    combined.sort((a, b) => {
      const aKey = `${a.date}T${a.time || "00:00"}`;
      const bKey = `${b.date}T${b.time || "00:00"}`;
      return aKey.localeCompare(bKey);
    });

    const byDay = {};
    for (const d of weekDays) byDay[d.iso] = [];
    for (const ev of combined) {
      if (!byDay[ev.date]) byDay[ev.date] = [];
      byDay[ev.date].push(ev);
    }
    return byDay;
  }, [turmas, sessionsByTurma, weekStart, weekDays, teacherFilter, includeSessions]);

  const goPrevWeek  = () => setWeekStart(fmtDateISO(addDays(new Date(weekStart + "T00:00:00"), -7)));
  const goNextWeek  = () => setWeekStart(fmtDateISO(addDays(new Date(weekStart + "T00:00:00"),  7)));
  const goTodayWeek = () => setWeekStart(fmtDateISO(startOfWeek(new Date())));

  const todayItems = agendaByDay[todayISO] || [];
  const plannedTodayCount = todayItems.filter((ev) => ev.type === "planned").length;

  return (
    <main className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/" className="border rounded px-3 py-2">Voltar ao início</Link>
          <h1 className="text-2xl font-bold">Agenda</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro por professor */}
          <select
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
            className="border rounded px-2 py-1"
            title="Filtrar por professor"
          >
            <option value="all">Todos os professores</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {/* Alternância Hoje / Semana */}
          <div className="border rounded overflow-hidden">
            <button
              className={`px-3 py-2 ${view === "today" ? "bg-rose-600 text-white" : ""}`}
              onClick={() => setView("today")}
              title="Mostrar somente os compromissos de hoje"
            >
              Hoje
            </button>
            <button
              className={`px-3 py-2 ${view === "week" ? "bg-rose-600 text-white" : ""}`}
              onClick={() => setView("week")}
              title="Mostrar toda a semana"
            >
              Semana
            </button>
          </div>

          {/* Incluir sessões (opcional) */}
          <label className="inline-flex items-center gap-2 text-sm border rounded px-2 py-1">
            <input
              type="checkbox"
              checked={includeSessions}
              onChange={(e) => setIncludeSessions(e.target.checked)}
            />
            Incluir sessões registradas
          </label>
        </div>
      </div>

      {view === "week" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-slate-700">
            <div>
              Semana de <b>{weekDays[0]?.label}</b> a <b>{weekDays[6]?.label}</b>
              {teacherFilter !== "all" && (
                <span className="ml-2 text-slate-500">• Prof.: <b>{teacherName(teacherFilter)}</b></span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={goPrevWeek} className="border rounded px-3 py-2">◀ Semana anterior</button>
              <button onClick={goTodayWeek} className="border rounded px-3 py-2">Hoje</button>
              <button onClick={goNextWeek} className="border rounded px-3 py-2">Próxima semana ▶</button>
            </div>
          </div>

          {loading ? (
            <div className="p-4">Carregando…</div>
          ) : (
            <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {weekDays.map((d) => {
                const items = agendaByDay[d.iso] || [];
                return (
                  <div key={d.iso} className="border rounded">
                    <div className="p-3 border-b bg-gray-50 font-semibold">{d.label}</div>
                    {items.length === 0 ? (
                      <div className="p-3 text-slate-500">Sem aulas.</div>
                    ) : (
                      <ul className="divide-y">
                        {items.map((ev, idx) => (
                          <li key={idx} className="p-3">
                            <div className="text-sm">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs mr-2 ${
                                ev.type === "planned" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                              }`}>
                                {ev.type === "planned" ? "Planejada" : "Sessão"}
                              </span>
                              <b>{ev.turma_name}</b>
                              <span className="text-slate-500"> • Prof.: {teacherName(ev.teacher_id)}</span>
                            </div>
                            <div className="text-slate-700 mt-1">
                              {ev.type === "planned"
                                ? fmtBRDateTime(ev.date, ev.time)
                                : `${fmtBRDateTime(ev.date)} • duração ${ev.duration_hours.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`}
                            </div>
                            {ev.type === "session" && ev.notes && (
                              <div className="text-xs text-slate-500 mt-1">Obs: {ev.notes}</div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </section>
          )}
        </>
      ) : (
        // ======= HOJE (layout limpo, focado em PREVISTAS) =======
        <section className="max-w-3xl">
          <div className="border rounded">
            <div className="p-3 border-b bg-gray-50 font-semibold flex items-center justify-between">
              <div>
                Hoje — {new Date().toLocaleDateString("pt-BR")}
                {teacherFilter !== "all" && (
                  <span className="ml-2 text-slate-500">• Prof.: <b>{teacherName(teacherFilter)}</b></span>
                )}
              </div>
              <div className="text-slate-700 text-sm">
                Aulas previstas hoje: <b>{plannedTodayCount}</b>
              </div>
            </div>

            {loading ? (
              <div className="p-4">Carregando…</div>
            ) : todayItems.length === 0 ? (
              <div className="p-4 text-slate-500">Sem aulas para hoje.</div>
            ) : (
              <ul className="divide-y">
                {todayItems.map((ev, idx) => (
                  <li key={idx} className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs mr-2 ${
                            ev.type === "planned" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                          }`}>
                            {ev.type === "planned" ? "Planejada" : "Sessão"}
                          </span>
                          <b>{ev.turma_name}</b>
                          <span className="text-slate-500"> • Prof.: {teacherName(ev.teacher_id)}</span>
                        </div>
                        <div className="text-slate-700 mt-1">
                          {ev.type === "planned"
                            ? `Às ${(ev.time || "00:00").slice(0,5)} • duração ${ev.duration_hours.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`
                            : `Duração ${ev.duration_hours.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h`}
                        </div>
                        {ev.type === "session" && ev.notes && (
                          <div className="text-xs text-slate-500 mt-1">Obs: {ev.notes}</div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

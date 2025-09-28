"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseGateway as gw } from "@/lib/supabaseGateway";
import { useRouter } from "next/navigation";
import WeekGrid from "@/components/WeekGrid";


// YYYY-MM-DD (fuso São Paulo)
function todayISO() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // "YYYY-MM-DD"
}

// Início da semana (weekStartsOn = 1 => segunda-feira)
function startOfWeekISO(ymd, weekStartsOn = 1) {
  const [Y, M, D] = String(ymd).slice(0, 10).split("-").map(Number);
  const d = new Date(Date.UTC(Y, M - 1, D));
  const dow = d.getUTCDay(); // 0..6 (0=Dom)
  const back = (dow - weekStartsOn + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

// Adiciona N dias em YYYY-MM-DD (UTC estável)
function addDaysISO(ymd, n = 0) {
  const [Y, M, D] = String(ymd).slice(0, 10).split("-").map(Number);
  const d = new Date(Date.UTC(Y, M - 1, D));
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}

function fmtBRDateDots(ymd) {
  const s = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "";
  const [Y, M, D] = s.split("-");
  return `${D}.${M}.${Y}`;
}

/** Se a sessão real não tiver hora, injeta horário a partir das meeting_rules */
function withDisplayTimeFromRules(ev, turma) {
  if (!ev?.date) return ev;

  const s = String(ev.date);
  const hasClock = s.length > 10; // tem parte de hora?

  // Detecta "00:00" de forma segura (sem UTC shift)
  if (hasClock) {
    // Caso ISO padrão: "YYYY-MM-DDTHH:mm..."
    let hhmm = "";
    if (s[10] === "T" && s.length >= 16) {
      hhmm = s.slice(11, 16);
    } else {
      // Fallback: tenta Date só para extrair HH:mm local
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        hhmm = `${hh}:${mm}`;
      }
    }
    // Se já tem hora diferente de 00:00 → mantém
    if (hhmm && hhmm !== "00:00") return ev;
    // Se caiu em "00:00", vamos injetar horário da regra/turma
  }

  // Sem hora ou com 00:00 → pega horário da rule (weekday) ou meeting_time ou 08:00
  const ymd = s.slice(0, 10); // "YYYY-MM-DD"
  const [Y, M, D] = ymd.split("-").map(Number);
  const wd = new Date(Date.UTC(Y, M - 1, D)).getUTCDay(); // 0..6

  const rules = Array.isArray(turma?.meeting_rules) ? turma.meeting_rules : [];
  const rule = rules.find((r) => Number(r.weekday) === wd);

  const time = (rule?.time || turma?.meeting_time || "08:00").trim();
  return { ...ev, time_from_rule: time };
}

/** Gera slots planejados para a semana [weekStart .. weekStart+6] */
function plannedSlotsForWeek(turma, weekStartYMD) {
  const rules = Array.isArray(turma?.meeting_rules) ? turma.meeting_rules : [];
  if (!rules.length) return [];
  const out = [];
  for (let i = 0; i < 7; i++) {
    const ymd = addDaysISO(weekStartYMD, i);
    const [Y, M, D] = ymd.split("-").map(Number);
    const wd = new Date(Date.UTC(Y, M - 1, D)).getUTCDay();
    const r = rules.find((rr) => Number(rr.weekday) === wd);
    if (!r) continue;
    out.push({
      type: "planned",
      turma_id: turma.id,
      turma_name: turma.name,
      date: ymd,
      time: r.time || "08:00",
      duration_hours: Number(r.duration_hours ?? 0.5),
    });
  }
  return out;
}

export default function AgendaPage() {
  async function showClaims() {
    const { data } = await import("@/lib/supabaseClient").then(mod => mod.supabase.auth.getSession());
    const token = data?.session?.access_token;
    if (!token) return alert("Sem sessão");
    const [, payload] = token.split(".");
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  alert(`[DEBUG ADMIN] Claims JWT:\nrole=${json.role}\ntenant_id=${json.tenant_id}\nperms=${JSON.stringify(json.perms||{})}`);
  }
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [turmas, setTurmas] = useState([]);
  const [sessionsByTurma, setSessionsByTurma] = useState({});
  const [weekStart, setWeekStart] = useState(() => startOfWeekISO(todayISO(), 1));
  const [selectedDay, setSelectedDay] = useState(null); // null = semana, string = YYYY-MM-DD
  const router = useRouter();

  // 1) Realce do dia de hoje
  const todayYMD = useMemo(() => todayISO(), []);
  const isToday = (ymd) => String(ymd).slice(0,10) === todayYMD;

  // Carrega turmas + sessões reais da semana
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const ts = await gw.listTurmas();
        if (!mounted) return;

        const end = addDaysISO(weekStart, 6);
        const byTurma = {};
        for (const t of ts) {
          const sess = await gw.listSessionsWithAttendance({
            turmaId: t.id,
            start: weekStart,
            end,
          });
          byTurma[t.id] = sess;
        }
        setTurmas(ts);
        setSessionsByTurma(byTurma);
        setError("");
      } catch (e) {
        setError(e?.message || String(e));
      } finally {
        mounted && setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [weekStart]);

  // Lista (planned + real), com dedupe
  const items = useMemo(() => {
    const map = [];
    for (const t of turmas) {
      const planned = plannedSlotsForWeek(t, weekStart);
      const sess = sessionsByTurma[t.id] || [];

      const realKey = new Set(
        sess.map((s) => `${t.id}|${String(s.date).slice(0, 10)}`)
      );

      for (const p of planned) {
        const key = `${t.id}|${p.date}`;
        if (!realKey.has(key)) map.push({ ...p, turma_name: t.name, label: "Planejada" });
      }
      for (const s of sess) {
        const normalized = {
          type: "session",
          id: s.id,
          turma_id: t.id,
          turma_name: t.name,
          date: s.date,
          duration_hours: s.duration_hours,
          has_attendance: s.has_attendance,
          label: s.has_attendance ? "Sessão (com presença)" : "Sessão (registrada)",
        };
        map.push(withDisplayTimeFromRules(normalized, t));
      }
    }
    const sorted = map.sort((a, b) => {
      const ad =
        String(a.date).length > 10
          ? String(a.date)
          : `${a.date}T${a.time_from_rule || a.time || "00:00"}:00`;
      const bd =
        String(b.date).length > 10
          ? String(b.date)
          : `${b.date}T${b.time_from_rule || b.time || "00:00"}:00`;
      return ad.localeCompare(bd);
    });
    if (selectedDay) {
      return sorted.filter(ev => String(ev.date).slice(0, 10) === selectedDay);
    }
    return sorted;
  }, [turmas, sessionsByTurma, weekStart, selectedDay]);

  // Navega para Turmas › [id] com query abrindo o modal lá
  function goToCreateSession(ev) {
    console.log("[Agenda] Card clicado:", ev); // debug rápido no console
  // ev (planned): { turma_id, date:"YYYY-MM-DD", time:"HH:mm", duration_hours:number, ... }
  const turmaId =
    String(ev?.turma_id ?? ev?.turmaId ?? ev?.turma?.id ?? "").trim();
  if (!turmaId) {
    alert("Não consegui identificar a turma deste card.");
    return;
  }

  const date = String(ev?.date ?? "").slice(0, 10);
  const durationHours = Number.isFinite(ev?.duration_hours)
    ? Math.max(0.5, Number(ev.duration_hours))
    : 0.5;

  // resolve HH:mm (ev.time -> ev.time_from_rule -> extrai de date ISO)
  const hhmm = (() => {
    if (ev?.time) return String(ev.time).slice(0, 5);
    if (ev?.time_from_rule) return String(ev.time_from_rule).slice(0, 5);
    const s = String(ev?.date || "");
    return (s.length > 10 && s[10] === "T") ? s.slice(11, 16) : "";
  })();
  const notes = hhmm ? `Criado via Agenda às ${hhmm}` : "";

  const qs = new URLSearchParams();
  qs.set("modal", "criar");
  if (date) qs.set("date", date);
  qs.set("duration_hours", String(durationHours));
  if (notes) qs.set("notes", notes);
  if (hhmm) qs.set("time", hhmm);

  router.push(`/turmas/${turmaId}?${qs.toString()}`);
}

const weekLabel = useMemo(() => {
  const end = addDaysISO(weekStart, 6);
  return `${weekStart} → ${end}`;
}, [weekStart]);

function goPrevWeek() { setWeekStart((p) => addDaysISO(p, -7)); }
function goNextWeek() { setWeekStart((p) => addDaysISO(p,  7)); }
function goThisWeek() {
  const today = todayISO();
  if (selectedDay === today) return; // já está no dia
  setSelectedDay(today);
}

function goFullWeek() {
  setSelectedDay(null);
}
// ⬆️ COLOQUE ESTES HELPERS LOGO ACIMA DO `return`:
const groupsByDay = useMemo(() => {
  const map = new Map(); // ymd -> [events]

  for (const ev of (items || [])) {
    const ymd = String(ev.date).slice(0, 10);

    // ⛔️ pula DOMINGO (getDay() === 0)
    const wd = new Date(`${ymd}T00:00:00`).getDay(); // 0..6 (0=Dom)
    if (wd === 0) continue;

    if (!map.has(ymd)) map.set(ymd, []);
    map.get(ymd).push(ev);
  }

  // ordena eventos por horário dentro do dia
  const toHHMM = (ev) => {
    if (ev.time) return ev.time;
    if (ev.time_from_rule) return ev.time_from_rule;
    if (String(ev.date).length > 10) {
      const d = new Date(ev.date);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return "00:00";
  };

  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ymd, dayEvents]) => [ymd, dayEvents.sort((a, b) => toHHMM(a).localeCompare(toHHMM(b)))]);
}, [items]);

const weekdayShort = (ymd) => {
  const d = new Date(`${ymd}T00:00:00`);
  return ["dom","seg","ter","qua","qui","sex","sáb"][d.getDay()];
};
const daysOfWeek = useMemo(() => {
  // já temos weekStart (segunda). Mantém padrão Seg→Sáb (6 colunas).
  return Array.from({ length: 6 }, (_, i) => addDaysISO(weekStart, i));
}, [weekStart]);

// 👇 Normaliza eventos para o WeekGrid (garante turma_id, hhmm, duration_min)
 const eventsForGrid = useMemo(() => {
   const toHHMM = (ev) => {
     if (ev?.time) return String(ev.time).slice(0, 5);
     if (ev?.time_from_rule) return String(ev.time_from_rule).slice(0, 5);
     const s = String(ev?.date || "");
     return (s.length > 10 && s[10] === "T") ? s.slice(11, 16) : "00:00";
   };
   return (items || []).map((ev, i) => {
     const ymd = String(ev.date).slice(0, 10);
     const turmaId =
       ev?.turma_id ?? ev?.turmaId ?? ev?.turma?.id ?? null;
     const hhmm = toHHMM(ev);
    const durationMin = Math.round((Number(ev?.duration_hours ?? 0.5) || 0.5) * 60);
     return {
       id: ev.id ?? `ev-${ymd}-${turmaId ?? "noTurma"}-${hhmm}-${i}`,
       turma_id: turmaId,
      turma_name: ev.turma_name,
       date: ymd,
      hhmm,
       duration_min: durationMin,
       type: ev.type,
       has_attendance: ev.has_attendance,
     };
   });
}, [items]);

if (error) {
  return (
    <div className="p-4">
      <h1 className="font-semibold text-lg">Agenda</h1>
      <p className="text-red-600 mt-2">Erro: {error}</p>
    </div>
  );
}

return (
  <div className="p-4 space-y-4">
    {/* Toolbar topo — conforme combinado */}
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>

      <div className="flex items-center gap-2">
        {/* Semana anterior / próxima */}
        <button
          onClick={goPrevWeek}
          className="px-3 py-1.5 border rounded-md shadow-sm bg-white hover:bg-slate-50 disabled:opacity-50"
          disabled={!!selectedDay}
          aria-label="Semana anterior"
        >
          ◀
        </button>

        <span className="text-sm text-slate-600 w-[200px] text-center">
          {selectedDay ? `Dia ${selectedDay}` : weekLabel}
        </span>

        <button
          onClick={goNextWeek}
          className="px-3 py-1.5 border rounded-md shadow-sm bg-white hover:bg-slate-50 disabled:opacity-50"
          disabled={!!selectedDay}
          aria-label="Próxima semana"
        >
          ▶
        </button>

        {/* Hoje */}
        <button
          onClick={goThisWeek}
          className="px-3 py-1.5 border rounded-md shadow-sm bg-white hover:bg-slate-50 ml-2"
        >
          Hoje
        </button>

        {/* Toggle Semana/Dia (pílulas) */}
        <div className="ml-2 inline-flex border rounded-lg overflow-hidden shadow-sm">
          <button
            onClick={() => setSelectedDay(null)}
            className={`px-3 py-1.5 text-sm ${!selectedDay ? "bg-slate-900 text-white" : "bg-white"}`}
          >
            Semana
          </button>
          <button
            onClick={() => setSelectedDay(todayISO())}
            className={`px-3 py-1.5 text-sm ${selectedDay ? "bg-slate-900 text-white" : "bg-white"}`}
          >
            Dia
          </button>
        </div>
      </div>
    </div>

    {loading ? (
      <p className="text-sm text-gray-500">Carregando…</p>
    ) : (
      <WeekGrid
        days={daysOfWeek}
        events={eventsForGrid}
        fmtBRDateDots={fmtBRDateDots}
        onOpen={goToCreateSession}
      />
    )}
  </div>
)}

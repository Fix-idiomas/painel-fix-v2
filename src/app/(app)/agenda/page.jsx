"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseGateway as gw } from "@/lib/supabaseGateway";

/** ===== Helpers de data (sem depender de libs externas) ===== */
const TZ = "America/Sao_Paulo";

// YYYY-MM-DD (fuso São Paulo)
function todayISO() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  const d = parts.find(p => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}
function addDaysISO(ymd, n=0) {
  const d = new Date(`${ymd}T00:00:00-03:00`); // fuso SP aproximado
  d.setDate(d.getDate() + Number(n||0));
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const dd= String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}
function startOfWeekISO(ymd) {
  const d = new Date(`${ymd}T00:00:00-03:00`);
  const dow = d.getDay(); // 0..6 (0=Dom)
  const diff = dow === 0 ? 0 : dow; // começando Domingo
  return addDaysISO(ymd, -diff);
}
function toIsoLocal(dateYMD, hhmm="00:00") {
  const [H="00", M="00"] = String(hhmm||"00:00").split(":");
  const d = new Date(`${dateYMD}T${H.padStart(2,"0")}:${M.padStart(2,"0")}:00`);
  return d.toISOString();
}

/** Dado um item (sessão real), injeta horário vindo da regra, se o horário estiver 00:00 */
function withDisplayTimeFromRules(ev, turma) {
  if (!ev?.date) return ev;
  // Se já veio com hora diferente de 00:00, mantém
  const hasTime = ev.date.length > 10;
  if (hasTime) return ev;

  // Puxa horário da rule correspondente ao weekday
  const d = new Date(`${ev.date}T00:00:00-03:00`);
  const wd = d.getDay(); // 0..6
  const rule = (turma?.meeting_rules || []).find(r => Number(r.weekday) === wd);
  const time = rule?.time || "08:00";
  return { ...ev, time_from_rule: time };
}

/** Gera slots planejados para uma turma na semana [monday..sunday] */
function plannedSlotsForWeek(turma, weekStartYMD) {
  const rules = Array.isArray(turma?.meeting_rules) ? turma.meeting_rules : [];
  if (!rules.length) return [];
  const out = [];
  for (let i=0;i<7;i++) {
    const ymd = addDaysISO(weekStartYMD, i);
    const d = new Date(`${ymd}T00:00:00-03:00`);
    const wd = d.getDay();
    const r = rules.find(rr => Number(rr.weekday) === wd);
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
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [turmas, setTurmas] = useState([]);
  const [sessionsByTurma, setSessionsByTurma] = useState({});
  const [weekStart, setWeekStart] = useState(() => startOfWeekISO(todayISO()));

  // Carrega turmas + sessões reais da semana
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const ts = await gw.listTurmas();
        if (!mounted) return;

        // Para cada turma, buscar sessões reais no intervalo da semana
        const end = addDaysISO(weekStart, 6);
        const byTurma = {};
        for (const t of ts) {
          const sess = await gw.listSessionsWithAttendance({ turmaId: t.id, start: weekStart, end });
          byTurma[t.id] = sess;
        }

        setTurmas(ts);
        setSessionsByTurma(byTurma);
      } catch (e) {
        setError(e?.message || String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [weekStart]);

  // Constrói a lista de itens (planned + real), com dedupe
  const items = useMemo(() => {
    const end = addDaysISO(weekStart, 6);
    const map = [];

    for (const t of turmas) {
      // planned
      const planned = plannedSlotsForWeek(t, weekStart);

      // reais
      const sess = sessionsByTurma[t.id] || [];

      // dedupe: se existe sessão real no mesmo YMD da turma, não mostra o planejado daquele dia
      const realKey = new Set(sess.map(s => `${t.id}|${String(s.date).slice(0,10)}`));

      for (const p of planned) {
        const key = `${t.id}|${p.date}`;
        if (!realKey.has(key)) {
          map.push({
            ...p,
            turma_name: t.name,
            label: "Planejada",
          });
        }
      }
      for (const s of sess) {
        const normalized = {
          type: "session",
          id: s.id,
          turma_id: t.id,
          turma_name: t.name,
          date: s.date, // pode ser ISO com hora
          duration_hours: s.duration_hours,
          has_attendance: s.has_attendance,
          label: s.has_attendance ? "Sessão (com presença)" : "Sessão (registrada)",
        };
        // injeta horário da rule quando o date vier sem hora (00:00)
        map.push(withDisplayTimeFromRules(normalized, t));
      }
    }

    // Ordena por data/hora
    return map.sort((a,b) => {
      const ad = a.date.length > 10 ? a.date : `${a.date}T${a.time_from_rule || a.time || "00:00"}:00`;
      const bd = b.date.length > 10 ? b.date : `${b.date}T${b.time_from_rule || b.time || "00:00"}:00`;
      return ad.localeCompare(bd);
    });
  }, [turmas, sessionsByTurma, weekStart]);

  async function onRegisterPlanned(ev) {
    // ev: { type:"planned", turma_id, date:"YYYY-MM-DD", time:"HH:mm", duration_hours }
    if (!ev?.turma_id || !ev?.date) return alert("Dados insuficientes do slot.");
    try {
      setSaving(true);
      await gw.createSession({
        turma_id: ev.turma_id,
        date: toIsoLocal(ev.date, ev.time), // salva timestamptz com hora
        notes: "Aula registrada a partir da agenda",
        duration_hours: ev.duration_hours ?? 0.5,
        headcount_snapshot: null,
      });

      // Recarrega só a turma afetada (na mesma semana)
      const end = addDaysISO(weekStart, 6);
      const sess = await gw.listSessionsWithAttendance({
        turmaId: ev.turma_id, start: weekStart, end
      });
      setSessionsByTurma(old => ({ ...old, [ev.turma_id]: sess }));
      alert("Aula registrada ✅");
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  }

  const weekLabel = useMemo(() => {
    const end = addDaysISO(weekStart, 6);
    return `${weekStart} → ${end}`;
  }, [weekStart]);

  function goPrevWeek() { setWeekStart(prev => addDaysISO(prev, -7)); }
  function goNextWeek() { setWeekStart(prev => addDaysISO(prev, 7)); }
  function goThisWeek() { setWeekStart(startOfWeekISO(todayISO())); }

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
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-lg">Agenda</h1>
        <div className="flex items-center gap-2">
          <button onClick={goPrevWeek} className="px-2 py-1 border rounded">◀ Semana</button>
          <span className="text-sm text-gray-600">{weekLabel}</span>
          <button onClick={goNextWeek} className="px-2 py-1 border rounded">Semana ▶</button>
          <button onClick={goThisWeek} className="px-2 py-1 border rounded ml-2">Hoje</button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Carregando…</p>
      ) : (
        <ul className="space-y-2">
          {items.map((ev, idx) => {
            const ymd = String(ev.date).slice(0,10);
            const hhmm =
              (ev.date.length > 10 ? new Date(ev.date).toISOString().slice(11,16)
               : (ev.time_from_rule || ev.time || "00:00"));
            return (
              <li key={`${ymd}-${idx}`} className="p-3 border rounded">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{ev.turma_name}</div>
                    <div className="text-sm text-gray-600">
                      {ymd} • {hhmm} — {ev.label}
                    </div>
                  </div>
                  {ev.type === "planned" && (
                    <div>
                      <button
                        onClick={() => onRegisterPlanned(ev)}
                        disabled={saving}
                        className="text-xs px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                        title="Transformar este horário em aula realizada"
                      >
                        {saving ? "Registrando..." : "Registrar aula"}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="text-sm text-gray-500">Nenhum item nesta semana.</li>
          )}
        </ul>
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabaseGateway as gw } from "@/lib/supabaseGateway";
import { useRouter } from "next/navigation";

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

/** Se a sessão real não tiver hora, injeta horário a partir das meeting_rules */
function withDisplayTimeFromRules(ev, turma) {
  if (!ev?.date) return ev;
  if (String(ev.date).length > 10) return ev; // já tem hora
  const [Y, M, D] = String(ev.date).slice(0, 10).split("-").map(Number);
  const wd = new Date(Date.UTC(Y, M - 1, D)).getUTCDay(); // 0..6
  const rule = (turma?.meeting_rules || []).find((r) => Number(r.weekday) === wd);
  const time = rule?.time || "08:00";
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
    router.push(`/turmas/${ev.turma_id}`);
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
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-lg">Agenda</h1>
          <button onClick={showClaims} className="px-2 py-1 border rounded bg-yellow-50 hover:bg-yellow-100 text-yellow-900">Ver claims</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goPrevWeek} className="px-2 py-1 border rounded" disabled={!!selectedDay}>◀ Semana</button>
          <span className="text-sm text-gray-600">{selectedDay ? `Dia ${selectedDay}` : weekLabel}</span>
          <button onClick={goNextWeek} className="px-2 py-1 border rounded" disabled={!!selectedDay}>Semana ▶</button>
          {!selectedDay ? (
            <button onClick={goThisWeek} className="px-2 py-1 border rounded ml-2">Hoje</button>
          ) : (
            <button onClick={goFullWeek} className="px-2 py-1 border rounded ml-2">Semana</button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Carregando…</p>
      ) : (
        <ul className="space-y-2">
          {items.map((ev, idx) => {
            const ymd = String(ev.date).slice(0, 10);
            const hhmm =
              String(ev.date).length > 10
                ? new Date(ev.date).toISOString().slice(11, 16)
                : ev.time_from_rule || ev.time || "00:00";
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
                    <button
                      onClick={() => goToCreateSession(ev)}
                      className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                      title="Abrir criação de sessão na página da turma"
                    >
                      Registrar aula
                    </button>
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

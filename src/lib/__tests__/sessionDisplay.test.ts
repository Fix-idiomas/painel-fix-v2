// Fuso fixo: as funções de exibição usam a hora LOCAL do runtime (no navegador =
// America/Sao_Paulo). Fixamos TZ antes de qualquer Date para determinismo.
process.env.TZ = "America/Sao_Paulo";

import { describe, it, expect } from "vitest";
import {
  spYearMonth,
  fmtSessionDateWithRules,
  buildTodayClasses,
} from "@/lib/sessionDisplay";

describe("spYearMonth", () => {
  it("retorna '' para entrada vazia ou inválida", () => {
    expect(spYearMonth("")).toBe("");
    expect(spYearMonth(null)).toBe("");
    expect(spYearMonth(undefined)).toBe("");
    expect(spYearMonth("não-é-data")).toBe("");
  });

  it("usa o fuso SP: aula noturna do dia 31 (UTC já virou dia 1) fica no mês certo", () => {
    // 2026-08-01T02:00Z = 2026-07-31 23:00 em SP → ainda julho.
    expect(spYearMonth("2026-08-01T02:00:00Z")).toBe("2026-07");
    // 2026-08-01T04:00Z = 2026-08-01 01:00 em SP → agosto.
    expect(spYearMonth("2026-08-01T04:00:00Z")).toBe("2026-08");
  });

  it("formata YYYY-MM com zero à esquerda", () => {
    expect(spYearMonth("2026-03-15T12:00:00Z")).toBe("2026-03");
  });
});

describe("fmtSessionDateWithRules", () => {
  const turma = {
    meeting_rules: [
      { weekday: 2, time: "19:30", duration_hours: 1 }, // terça
      { weekday: 4, time: "08:00", duration_hours: 1 }, // quinta
    ],
  };

  it("retorna '—' para data ausente/ inválida", () => {
    expect(fmtSessionDateWithRules(null, turma)).toBe("—");
    expect(fmtSessionDateWithRules("lixo", turma)).toBe("—");
  });

  it("mostra a hora real da sessão quando não é meia-noite", () => {
    // 2026-07-07 é terça; 19:30 local SP.
    expect(fmtSessionDateWithRules("2026-07-07T19:30:00-03:00", turma)).toBe(
      "07/07/2026 · 19:30"
    );
  });

  it("quando a sessão está 00:00, usa o horário da regra do MESMO dia da semana", () => {
    // 2026-07-07 é terça (weekday 2) → regra 19:30.
    expect(fmtSessionDateWithRules("2026-07-07T00:00:00-03:00", turma)).toBe(
      "07/07/2026 · 19:30"
    );
  });

  it("00:00 sem regra no dia → cai para a primeira regra com horário", () => {
    // 2026-07-08 é quarta (weekday 3) — nenhuma regra casa; fallback = 19:30.
    expect(fmtSessionDateWithRules("2026-07-08T00:00:00-03:00", turma)).toBe(
      "08/07/2026 · 19:30"
    );
  });

  it("00:00 sem nenhuma regra útil → mantém 00:00", () => {
    expect(fmtSessionDateWithRules("2026-07-07T00:00:00-03:00", { meeting_rules: [] })).toBe(
      "07/07/2026 · 00:00"
    );
    expect(fmtSessionDateWithRules("2026-07-07T00:00:00-03:00", null)).toBe(
      "07/07/2026 · 00:00"
    );
  });
});

describe("buildTodayClasses", () => {
  const teacherMap = { t1: "Ana", t2: "Bruno" };
  // todayDow = 2 (terça)
  const turmas = [
    {
      id: "A",
      name: "Turma A",
      teacher_id: "t1",
      room: "Sala 1",
      meeting_rules: [
        { weekday: 2, time: "19:00", duration_hours: 1 },
        { weekday: 4, time: "08:00", duration_hours: 1 }, // outro dia — ignorado
      ],
    },
    {
      id: "B",
      name: "Turma B",
      teacher_id: null,
      meeting_rules: [{ weekday: 3, time: "10:00" }], // quarta — não é hoje
    },
  ];

  it("gera só as aulas cujo weekday é hoje, ordenadas por horário", () => {
    const out = buildTodayClasses(turmas, teacherMap, [], 2);
    expect(out.map((c) => c.key)).toEqual(["A-19:00"]);
    const c = out[0];
    expect(c.turma_id).toBe("A");
    expect(c.turma_name).toBe("Turma A");
    expect(c.time).toBe("19:00");
    expect(c.teacher_name).toBe("Ana");
    expect(c.room).toBe("Sala 1");
    expect(c.session_id).toBeNull();
    expect(c.has_attendance).toBe(false);
  });

  it("'Sem professor' quando a turma não tem teacher_id", () => {
    const out = buildTodayClasses(turmas, teacherMap, [], 3); // quarta → Turma B
    expect(out).toHaveLength(1);
    expect(out[0].teacher_name).toBe("Sem professor");
  });

  it("casa a sessão pelo horário do slot e traz has_attendance", () => {
    const sessions = [
      { id: "s1", turma_id: "A", date: "2026-07-07T19:00:00-03:00", has_attendance: true },
    ];
    const out = buildTodayClasses(turmas, teacherMap, sessions, 2);
    expect(out[0].session_id).toBe("s1");
    expect(out[0].has_attendance).toBe(true);
  });

  it("turma com 2 aulas no mesmo dia: cada slot casa a SUA sessão", () => {
    const turma2 = [
      {
        id: "A",
        name: "Turma A",
        teacher_id: "t1",
        meeting_rules: [
          { weekday: 2, time: "08:00" },
          { weekday: 2, time: "19:00" },
        ],
      },
    ];
    const sessions = [
      { id: "manha", turma_id: "A", date: "2026-07-07T08:00:00-03:00", has_attendance: true },
      { id: "noite", turma_id: "A", date: "2026-07-07T19:00:00-03:00", has_attendance: false },
    ];
    const out = buildTodayClasses(turma2, teacherMap, sessions, 2);
    const byTime = Object.fromEntries(out.map((c) => [c.time, c]));
    expect(byTime["08:00"].session_id).toBe("manha");
    expect(byTime["08:00"].has_attendance).toBe(true);
    expect(byTime["19:00"].session_id).toBe("noite");
    expect(byTime["19:00"].has_attendance).toBe(false);
  });

  it("fallback: sem sessão no horário exato, casa qualquer sessão da turma hoje", () => {
    const sessions = [
      { id: "avulsa", turma_id: "A", date: "2026-07-07T10:00:00-03:00", has_attendance: true },
    ];
    const out = buildTodayClasses(turmas, teacherMap, sessions, 2);
    expect(out[0].session_id).toBe("avulsa");
    expect(out[0].has_attendance).toBe(true);
  });

  it("listas vazias/nulas não quebram", () => {
    expect(buildTodayClasses(null, teacherMap, null, 2)).toEqual([]);
    expect(buildTodayClasses([], teacherMap, [], 2)).toEqual([]);
  });
});

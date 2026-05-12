// src/app/api/ai/student-insights/route.ts
// POST /api/ai/student-insights
// Body: { student_id: string, force_refresh?: boolean }
//
// Fluxo:
//   1. Autenticação via Supabase session (cookies)
//   2. Permissão: is_admin_or_registry_read(p_tenant)
//   3. Busca dados do aluno + presenças
//   4. Calcula hash do input (cache key)
//   5. Se não force_refresh: tenta retornar cache (latest com mesmo hash)
//   6. Caso contrário, chama Anthropic e persiste em student_ai_insights

import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { NextRequest } from "next/server";
import crypto from "node:crypto";
import {
  generateStudentInsights,
  type AttendanceItem,
  type StudentSummary,
  type InsightOutput,
} from "@/lib/ai/anthropic";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function computeAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const dob = new Date(`${String(birthDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}

function firstName(fullName: string | null): string {
  const s = String(fullName || "").trim();
  if (!s) return "Aluno";
  const parts = s.split(/\s+/);
  return parts[0];
}

const EMPTY_OUTPUT: InsightOutput = {
  summary:
    "Sem observações suficientes para análise. Registre observações nas presenças das aulas pra habilitar recomendações da IA.",
  strengths: [],
  concerns: [],
  recommendations: [],
  next_steps: [
    "Registre observações curtas em cada aula (engajamento, dificuldades, destaques).",
    "Após 4–6 aulas com notas, volte aqui pra gerar a análise.",
  ],
};

export async function POST(req: NextRequest) {
  try {
    // Next 15: cookies() é async. Aguardamos e passamos como factory sync.
    // Cast necessário pois @supabase/auth-helpers-nextjs@0.10.x ainda
    // tipa a factory como retorno síncrono (compat Next 14).
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({
      cookies: (() => cookieStore) as unknown as typeof cookies,
    });
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return jsonResponse({ error: "Não autenticado." }, 401);
    }

    // Body
    const body = (await req.json().catch(() => ({}))) as {
      student_id?: string;
      force_refresh?: boolean;
    };
    const student_id = String(body?.student_id || "").trim();
    const force_refresh = !!body?.force_refresh;
    if (!student_id) {
      return jsonResponse({ error: "student_id é obrigatório." }, 400);
    }

    // Tenant + permissão
    const { data: tenant_id, error: tErr } = await supabase.rpc(
      "current_tenant_id"
    );
    if (tErr) throw tErr;
    if (!tenant_id) {
      return jsonResponse({ error: "Tenant não identificado." }, 403);
    }

    const { data: canRead, error: pErr } = await supabase.rpc(
      "is_admin_or_registry_read",
      { p_tenant: tenant_id }
    );
    if (pErr) throw pErr;
    if (!canRead) {
      return jsonResponse(
        { error: "Sem permissão para esta operação." },
        403
      );
    }

    // Fetch student (vinculado ao tenant via RLS)
    const { data: studentRows, error: sErr } = await supabase
      .from("students")
      .select("id, name, status, birth_date")
      .eq("id", student_id)
      .limit(1);
    if (sErr) throw sErr;
    const student = studentRows?.[0];
    if (!student) {
      return jsonResponse({ error: "Aluno não encontrado." }, 404);
    }

    // Fetch attendance + sessions + turmas (3 queries separadas — mesmo padrão
    // do studentGateway.listAttendanceByStudent, evita dependência de FKs no select)
    const { data: attRows, error: aErr } = await supabase
      .from("attendance")
      .select("session_id, present, note")
      .eq("student_id", student_id)
      .limit(500);
    if (aErr) throw aErr;

    const sessionIds = [
      ...new Set((attRows || []).map((a) => a.session_id).filter(Boolean)),
    ];

    type SessionRow = {
      id: string;
      date: string | null;
      turma_id: string | null;
    };
    let sessionMap = new Map<string, SessionRow>();
    if (sessionIds.length > 0) {
      const { data: sRows, error: sJoinErr } = await supabase
        .from("sessions")
        .select("id, date, turma_id")
        .in("id", sessionIds);
      if (sJoinErr) throw sJoinErr;
      sessionMap = new Map(
        (sRows || []).map((s) => [s.id as string, s as SessionRow])
      );
    }

    const turmaIds = [
      ...new Set(
        Array.from(sessionMap.values())
          .map((s) => s.turma_id)
          .filter((x): x is string => !!x)
      ),
    ];
    const turmaMap = new Map<string, string>();
    if (turmaIds.length > 0) {
      const { data: tRows, error: tJoinErr } = await supabase
        .from("turmas")
        .select("id, name")
        .in("id", turmaIds);
      if (tJoinErr) throw tJoinErr;
      for (const t of tRows || []) {
        turmaMap.set(t.id as string, (t.name as string) || "—");
      }
    }

    // Normaliza, ordena por data desc, pega 50 mais recentes
    const normalized: AttendanceItem[] = (attRows || [])
      .map((r) => {
        const s = sessionMap.get(r.session_id);
        const date = s?.date ? String(s.date).slice(0, 10) : "";
        const turma = s?.turma_id ? turmaMap.get(s.turma_id) || "—" : "—";
        return {
          date,
          turma,
          present: !!r.present,
          note: r.note ? String(r.note).trim() : null,
        };
      })
      .filter((x) => !!x.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 50);

    // Stats
    const presentCount = normalized.filter((a) => a.present).length;
    const absentCount = normalized.length - presentCount;
    const attendanceRate =
      normalized.length > 0 ? presentCount / normalized.length : null;

    // Per-turma breakdown
    const perTurmaMap = new Map<string, { total: number; present: number }>();
    for (const a of normalized) {
      const cur = perTurmaMap.get(a.turma) || { total: 0, present: 0 };
      cur.total += 1;
      if (a.present) cur.present += 1;
      perTurmaMap.set(a.turma, cur);
    }
    const perTurma = Array.from(perTurmaMap.entries()).map(
      ([turma, v]) => ({ turma, total: v.total, present: v.present })
    );

    const studentSummary: StudentSummary = {
      firstName: firstName(student.name),
      age: computeAge(student.birth_date as string | null),
      status: student.status || "—",
      totalSessions: normalized.length,
      presentCount,
      absentCount,
      attendanceRate,
      perTurma,
    };

    // Hash do payload (cache key)
    const payloadForHash = JSON.stringify({
      s: studentSummary,
      a: normalized,
    });
    const payload_hash = crypto
      .createHash("sha256")
      .update(payloadForHash)
      .digest("hex");

    // Curto-circuito: aluno sem notas → não chama IA
    const hasAnyNote = normalized.some((a) => !!a.note);
    if (!hasAnyNote && normalized.length === 0) {
      return jsonResponse({
        cached: false,
        skipped: true,
        output: EMPTY_OUTPUT,
        model: null,
        created_at: new Date().toISOString(),
      });
    }
    if (!hasAnyNote) {
      return jsonResponse({
        cached: false,
        skipped: true,
        output: {
          ...EMPTY_OUTPUT,
          summary:
            "Você tem presenças registradas, mas ainda não há observações detalhadas. As recomendações ficam muito melhores com pequenas notas em cada aula (mesmo curtas).",
        },
        model: null,
        created_at: new Date().toISOString(),
      });
    }

    // Cache lookup
    if (!force_refresh) {
      const { data: cached, error: cErr } = await supabase
        .from("student_ai_insights")
        .select("output, model, created_at, input_tokens, output_tokens")
        .eq("student_id", student_id)
        .eq("payload_hash", payload_hash)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!cErr && cached?.[0]) {
        return jsonResponse({
          cached: true,
          output: cached[0].output,
          model: cached[0].model,
          created_at: cached[0].created_at,
        });
      }
    }

    // Chama IA
    let result;
    try {
      result = await generateStudentInsights({
        student: studentSummary,
        attendance: normalized,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return jsonResponse(
        { error: `Falha ao gerar análise: ${msg}` },
        502
      );
    }

    // Persiste (best effort)
    try {
      await supabase.from("student_ai_insights").insert({
        tenant_id,
        student_id,
        payload_hash,
        output: result.output,
        model: result.model,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        created_by: session.user.id,
      });
    } catch (e) {
      console.warn("[student-insights] insert cache falhou:", e);
    }

    return jsonResponse({
      cached: false,
      output: result.output,
      model: result.model,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
}

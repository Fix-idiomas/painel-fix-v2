/**
 * Wrapper para análise de evolução do aluno via Anthropic Claude.
 *
 * Requer env var: ANTHROPIC_API_KEY (server-side only).
 *
 * Modelo: claude-haiku-4-5 — barato (~US$ 0,004/análise), bom em PT-BR.
 * Pra subir pra qualidade superior, trocar MODEL pra "claude-sonnet-4-5".
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5";
const MAX_OUTPUT_TOKENS = 1500;

// ─── Tipos públicos ─────────────────────────────────────────────
export type AttendanceItem = {
  date: string;          // YYYY-MM-DD
  turma: string;
  present: boolean;
  note: string | null;
};

export type StudentSummary = {
  firstName: string;
  age: number | null;
  status: string;
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  attendanceRate: number | null; // 0..1
  perTurma: Array<{ turma: string; total: number; present: number }>;
};

export type InsightOutput = {
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendations: Array<{
    category: "engajamento" | "didatica" | "contato" | "motivacao" | "outro";
    priority: "alta" | "media" | "baixa";
    title: string;
    action: string;
  }>;
  next_steps: string[];
};

export type GenerateResult = {
  output: InsightOutput;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

// ─── Cliente ────────────────────────────────────────────────────
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY ausente nas variáveis de ambiente.");
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

// ─── Prompts ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é um consultor pedagógico especialista em escolas de idiomas no Brasil. Seu papel é analisar o histórico de presença e as observações que o professor registrou sobre um aluno, e gerar recomendações práticas e específicas para que o professor possa melhorar o engajamento e os resultados desse aluno.

DIRETRIZES:
- Seja específico e acionável. Recomendações genéricas ("dar mais atenção") não ajudam.
- Use linguagem direta, em português do Brasil, como se falasse com o próprio professor.
- Priorize observações que aparecem com frequência ou que sugerem padrão (engajamento baixo, dificuldades específicas, etc.).
- Se houver poucos dados, seja honesto e indique isso.
- Considere o contexto: aluno de idiomas, em escola pequena, com professor que conhece o aluno.

RESPONDA SEMPRE EM JSON VÁLIDO com esta estrutura exata:

{
  "summary": "Parágrafo curto (3-5 linhas) com a leitura geral do aluno.",
  "strengths": ["ponto forte 1", "ponto forte 2", ...],
  "concerns": ["preocupação 1", "preocupação 2", ...],
  "recommendations": [
    {
      "category": "engajamento" | "didatica" | "contato" | "motivacao" | "outro",
      "priority": "alta" | "media" | "baixa",
      "title": "Título curto da recomendação",
      "action": "Descrição prática da ação que o professor pode tomar."
    }
  ],
  "next_steps": ["próximo passo 1", "próximo passo 2", "próximo passo 3"]
}

Categorias:
- engajamento: participação em aula, atenção, interesse
- didatica: como o professor pode adaptar o conteúdo ou abordagem
- contato: comunicação com o aluno ou responsável fora da aula
- motivacao: estímulos, metas, reforços positivos
- outro: o que não se encaixa nos demais

Retorne SOMENTE o JSON, sem markdown wrappers, sem comentários.`;

function buildUserMessage(
  student: StudentSummary,
  attendance: AttendanceItem[]
): string {
  const lines: string[] = [];
  lines.push(`# Aluno`);
  lines.push(`- Nome: ${student.firstName}`);
  if (student.age != null) lines.push(`- Idade: ${student.age} anos`);
  lines.push(`- Status: ${student.status}`);
  lines.push("");
  lines.push(`# Resumo de presença`);
  lines.push(`- Total de aulas registradas: ${student.totalSessions}`);
  lines.push(`- Presenças: ${student.presentCount}`);
  lines.push(`- Faltas: ${student.absentCount}`);
  if (student.attendanceRate != null) {
    lines.push(
      `- Assiduidade: ${Math.round(student.attendanceRate * 100)}%`
    );
  }
  if (student.perTurma.length > 1) {
    lines.push("");
    lines.push(`## Por turma:`);
    for (const t of student.perTurma) {
      const rate =
        t.total > 0 ? Math.round((t.present / t.total) * 100) : 0;
      lines.push(`- ${t.turma}: ${t.present}/${t.total} aulas (${rate}%)`);
    }
  }
  lines.push("");
  lines.push(`# Histórico (mais recentes primeiro, até 50 entradas)`);
  if (attendance.length === 0) {
    lines.push("(sem registros)");
  } else {
    for (const a of attendance) {
      const sym = a.present ? "✓" : "✗";
      const noteText = a.note ? ` — "${a.note.trim()}"` : "";
      lines.push(
        `- ${a.date} · ${a.turma} · ${sym}${noteText}`
      );
    }
  }
  lines.push("");
  lines.push(
    "Analise o histórico acima e devolva o JSON conforme as instruções."
  );
  return lines.join("\n");
}

// ─── Parser defensivo ───────────────────────────────────────────
function extractJson(text: string): unknown {
  // remove fences se vierem
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  // tenta parsear direto
  try {
    return JSON.parse(trimmed);
  } catch {
    // procura primeiro { e último } e tenta de novo
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const slice = trimmed.slice(first, last + 1);
      return JSON.parse(slice);
    }
    throw new Error("Resposta da IA não contém JSON válido.");
  }
}

function validateAndCoerce(raw: unknown): InsightOutput {
  if (!raw || typeof raw !== "object") {
    throw new Error("Saída da IA não é um objeto.");
  }
  const r = raw as Record<string, unknown>;
  const asArr = (v: unknown) => (Array.isArray(v) ? v : []);
  const asStr = (v: unknown) => (typeof v === "string" ? v : "");
  const asObj = (v: unknown) =>
    v && typeof v === "object" ? (v as Record<string, unknown>) : null;

  const cats = new Set([
    "engajamento",
    "didatica",
    "contato",
    "motivacao",
    "outro",
  ]);
  const prios = new Set(["alta", "media", "baixa"]);

  const recs = asArr(r.recommendations)
    .map((item) => {
      const o = asObj(item);
      if (!o) return null;
      const category = asStr(o.category).toLowerCase();
      const priority = asStr(o.priority).toLowerCase();
      return {
        category: (cats.has(category) ? category : "outro") as
          | "engajamento"
          | "didatica"
          | "contato"
          | "motivacao"
          | "outro",
        priority: (prios.has(priority) ? priority : "media") as
          | "alta"
          | "media"
          | "baixa",
        title: asStr(o.title).trim() || "(sem título)",
        action: asStr(o.action).trim() || "",
      };
    })
    .filter(Boolean) as InsightOutput["recommendations"];

  return {
    summary: asStr(r.summary).trim(),
    strengths: asArr(r.strengths)
      .map((s) => asStr(s).trim())
      .filter(Boolean),
    concerns: asArr(r.concerns)
      .map((s) => asStr(s).trim())
      .filter(Boolean),
    recommendations: recs,
    next_steps: asArr(r.next_steps)
      .map((s) => asStr(s).trim())
      .filter(Boolean),
  };
}

// ─── API pública ────────────────────────────────────────────────
export async function generateStudentInsights(input: {
  student: StudentSummary;
  attendance: AttendanceItem[];
}): Promise<GenerateResult> {
  const client = getClient();

  const userMessage = buildUserMessage(input.student, input.attendance);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  // Concatena os blocos de texto da resposta
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n");

  const parsed = extractJson(text);
  const output = validateAndCoerce(parsed);

  return {
    output,
    model: response.model || MODEL,
    usage: {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
    },
  };
}

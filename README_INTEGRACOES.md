# Plano de Integrações: Análise de Notas (Gemini) & Microsoft To Do

> Princípio seguido: levantar estritamente o que JÁ existe no código e banco antes de propor qualquer criação/modificação. Nada aqui altera o estado atual do projeto; é um artefato preparatório.

## 1. Objetivos
- Extrair insights estruturados das notas de aula e observações de presença (quando autorizado) usando um modelo LLM (ex.: Gemini) para apoiar acompanhamento pedagógico e engajamento.
- Gerar tarefas acionáveis a partir das análises (follow‑ups, atividades, contato com responsáveis) e sincronizá‑las com Microsoft To Do.
- Manter privacidade, minimizando envio de dados sensíveis e garantindo rastreabilidade.

## 2. Estado Atual (Evidências no Repositório)
| Domínio | Fonte | Evidência/Arquivo |
|---------|-------|------------------|
| Sessões (aulas) | Tabela `sessions` | Uso em `src/lib/supabaseGateway.js` (métodos `createSession`, `updateSession`, `listSessions`, `listSessionsWithAttendance`). Campos consumidos: `id,turma_id,date,duration_hours,notes,headcount_snapshot` |
| Presenças | Tabela `attendance` | Métodos `listAttendance`, `upsertAttendance`, `deleteAttendance` (campos: `student_id,present,note`) |
| UI Turmas | Página | `src/app/(app)/turmas/[id]/page.jsx` manipula `formSess.notes` e notas individuais de presença |
| Mail/E-mail | Rota API | `src/app/api/send-mail/route.js` (integração atual: Mailgun) |
| Sessão / Permissões | Contexto | `src/contexts/SessionContext.jsx` (claims reais via Supabase RPC/tabelas) |
| Nenhuma integração AI | Pesquisa | Ausência de referências a Gemini/LLM/MS Graph/MSAL (grep) |
| Nenhuma integração Microsoft To Do | Pesquisa | Não há chamadas a Graph ou pacotes MSAL |

## 3. Escopo da Análise (Gemini)
### Fonte primária de texto
- `sessions.notes` (texto livre da aula). Já persistido no banco.
- Opcional futuro: agregação de `attendance.note` (observações individuais) — somente após validação de necessidade e política de anonimização.

### Saída estruturada (proposta de JSON)
```jsonc
{
  "summary": "Revisão de tempos verbais com baixa participação dos alunos.",
  "risks": ["participação baixa", "2 alunos dispersos"],
  "suggested_tasks": [
    { "title": "Enviar exercício de reforço", "due_date": "2025-11-18", "priority": "medium", "notes": "Focar tempos verbais" },
    { "title": "Contato responsável - Aluno 1", "priority": "high" }
  ],
  "keywords": ["verb tenses", "participação", "engajamento"],
  "confidence": 0.82,
  "model": "gemini-1.5-pro",
  "tokens_in": 540,
  "tokens_out": 210,
  "generated_at": "2025-11-15T19:12:43Z"
}
```

### Regras
- Anonimizar ou substituir nomes de alunos antes do envio (ex.: "Aluno 1", "Aluno 2").
- Padronizar saída em JSON validado; se parsing falhar → retornar erro controlado.
- Não persistir resultados no banco inicialmente; cache em memória/UI. Persistência futura só após justificar necessidade.

## 4. Integração Microsoft To Do (Graph)
### Fluxos de criação
1. Usuário aciona "Analisar notas" → recebe `suggested_tasks` em estado de rascunho.
2. Usuário confirma itens → POST para rota interna que cria tarefas no Microsoft To Do.
3. Sincronização de status (concluída/pendente) via polling ou Subscription (fase posterior).

### Mapeamento de campos sugeridos → Graph
| Campo interno | Graph | Observações |
|---------------|-------|-------------|
| `title` | `subject` | Texto curto |
| `notes` | `body.content` | HTML simples ou texto plano |
| `due_date` | `dueDateTime.dateTime` | Formato ISO UTC; timezone `America/Sao_Paulo` indicado em `dueDateTime.timeZone` |
| `priority` | `priority` | Map: low->5, medium->3, high->1 |

### Escopos/OAuth (decisão pendente)
- Multiusuário (cada professor conecta sua conta) ou service account institucional.
- Escopo mínimo: `Tasks.ReadWrite`.

## 5. Endpoints Planejados (Contrato – Não Implementados)
### Análise de Sessão
`POST /api/sessions/{id}/analyze`
- Permissão requerida: usuário com `classes.read` (para ver) e idealmente `classes.write` (para gerar).
- Body:
```json
{ "reanalyze": false }
```
- Resposta 200:
```json
{ "ok": true, "analysis": { ...JSON acima... } }
```
- Erros:
  - 404 se sessão não pertence ao tenant ou não existe.
  - 403 se permissão insuficiente.
  - 429 se limite diário excedido.

### Criação de Tarefas a partir de Análise
`POST /api/sessions/{id}/tasks/sync`
- Body:
```json
{
  "tasks": [
    { "title": "...", "due_date": "2025-11-18", "priority": "high", "notes": "..." }
  ]
}
```
- Resposta 200:
```json
{ "ok": true, "created": [ { "local_title": "...", "ms_task_id": "abc123", "status": "synced" } ] }
```

### Ações futuras (não na primeira fase)
- `GET /api/sessions/{id}/analysis` (cache/persistência).
- `GET /api/todo/tasks?session_id=...` (listagem sincronizada).
- Webhook handler `/api/todo/webhook` (status remoto).

## 6. Fluxo de Dados (Resumo)
1. Usuário cria/edita sessão (`notes` já persistido). → Nada da integração ainda.
2. Clica "Analisar notas" → Front chama `/api/sessions/{id}/analyze`.
3. Server: carrega sessão, anonimiza texto, chama LLM, valida JSON → responde.
4. Usuário marca tarefas que quer enviar → Front chama `/api/sessions/{id}/tasks/sync`.
5. Server: para cada tarefa, chama Graph API → retorna `ms_task_id`.
6. (Futuro) Poll ou webhook atualiza status concluído e reflete no painel.

## 7. Segurança & Privacidade
| Aspecto | Estratégia Inicial |
|---------|--------------------|
| Dados sensíveis | Não enviar nomes completos; anonimizar alunos. |
| Escopos OAuth | Solicitar apenas `Tasks.ReadWrite`. |
| Armazenamento tokens | Criptografar/segredo em servidor; nunca no client em plain text. |
| Rate limiting | Contador de análises/dia por professor + tenant. |
| Auditoria | Log por requisição: `session_id`, `model`, `tokens_in/out`, `latency_ms`, `status`. |
| Erros LLM | Não expor stack; mensagem genérica com id de correlação. |

## 8. Decisões em Aberto
- Modelo exato (versão/especificação Gemini) e custo por token.
- Estratégia Microsoft Graph (multiusuário vs. conta de serviço). Avaliar impacto em visibilidade das tarefas.
- Persistir ou não o JSON de análise (coluna nova `sessions.analysis_json` → somente se reutilização ou histórico for requisito).
- Frequência de sincronização de status das tarefas (poll vs. webhook vs. manual refresh).

## 9. Roadmap Incremental
| Fase | Entregável | Sem mudanças de schema? |
|------|------------|-------------------------|
| 1 | Stub de endpoint `/api/sessions/{id}/analyze` retornando JSON fixo | Sim |
| 2 | Integração real com Gemini (somente `sessions.notes`) | Sim |
| 3 | UI de seleção e envio de tarefas para Graph (manual) | Sim |
| 4 | Mapeamento de prioridades + due_date | Sim |
| 5 | Persistência opcional de análise (decisão) | Não (se criar coluna) |
| 6 | Webhook/poll de atualização de status | Sim |
| 7 | Inclusão opcional de `attendance.note` com anonimização | Sim |

## 10. Próximos Artefatos Técnicos (quando autorizado)
- `src/lib/anonymize.js`: função `anonymizeSessionNotes(raw, attendanceRows)` → texto limpo.
- `src/lib/llmClient.js`: wrapper (`analyzeSessionNotes({ text, meta })`) → retorna JSON.
- `src/lib/graphClient.js`: `createTask({ subject, body, dueDateTime, priority })`.
- Schemas Zod/Validação: `analysisSchema`, `taskDraftSchema`.
- Testes de contrato (ex.: Jest ou Vitest) para validar shape retornado antes de integrar UI.

## 11. Critérios de Aceite (MVP)
- Endpoint de análise não grava nada novo no banco e responde em < 3s com JSON válido.
- Nenhum dado pessoal sensível (nomes completos) aparece no payload enviado ao LLM ou retornado em `suggested_tasks`.
- Criação manual de ao menos uma tarefa Microsoft To Do retorna `ms_task_id` e status `synced`.

## 12. Glossário
| Termo | Definição |
|-------|-----------|
| `session` | Registro de aula em `sessions` (já existente). |
| `attendance` | Presença individual por aluno com nota opcional. |
| `analysis` | Saída estruturada JSON gerada pelo LLM. |
| `suggested_tasks` | Lista de tarefas potenciais derivadas da análise (antes de envio ao Graph). |
| `ms_task_id` | Identificador da tarefa criada no Microsoft To Do. |
| `anonimização` | Processo de remover PII (nomes, emails, etc.) antes do processamento externo. |

## 13. Referências Internas (Linhas Chave)
- `src/lib/supabaseGateway.js`: métodos `createSession`, `updateSession`, `listSessions`, `listAttendance`, `upsertAttendance`.
- `src/app/(app)/turmas/[id]/page.jsx`: criação/edição de sessão e manipulação de `formSess.notes`.
- `src/app/api/send-mail/route.js`: padrão simples de rota externa (base para estilo das novas rotas).
- `src/contexts/SessionContext.jsx`: obtenção de `isAdmin`, `perms` para validar acesso.

---
**Status**: Documento de planejamento criado sem qualquer modificação de schema ou código existente. A próxima ação depende de autorização explícita para iniciar a Fase 1 (stub de endpoint). 

Se aprovar, posso preparar os contratos Zod ou avançar para o endpoint stub sem lógica externa. Indique o próximo passo desejado.

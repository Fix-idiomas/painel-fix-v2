<!--
TEMPLATE DE PRD — Painel Fix v2
Como usar:
  1. Copie este arquivo para docs/prd/PRD-<numero>-<slug-curto>.md
     ex.: docs/prd/PRD-7-exportacao-relatorios.md
  2. Preencha as seções. Apague as instruções em itálico (linhas "> _..._").
  3. Seções marcadas (Obrigatória) não devem ficar vazias. As (Opcional)
     podem ser removidas se não se aplicarem.
  4. Mantenha o texto em pt-BR e curto: um PRD bom cabe em ~2 páginas.
  5. Convenções de IDs: requisitos recebem IDs estáveis (RF-1, RNF-1, ...)
     para serem referenciados em tasks, commits e critérios de aceite.
Regra de ouro: o PRD diz O QUE e POR QUÊ. O COMO (design técnico detalhado)
é resumido aqui e aprofundado na implementação/ADR.
-->

# PRD-<n> — <Título curto e claro>

> **Status:** rascunho | em revisão | aprovado | em desenvolvimento | entregue
> **Autor(a):** <nome> · **Data:** <AAAA-MM-DD> · **Última atualização:** <AAAA-MM-DD>
> **Sequência:** <n> de <total> *(se fizer parte de um conjunto)* · **Depende de:** <PRD-x / —> · **Habilita:** <PRD-y / —>
> **Stakeholders:** <produto, eng, design, quem aprova>

---

## 1. Contexto & objetivo  *(Obrigatória)*

> _Por que isto existe? Qual problema ou oportunidade? O que muda para o usuário/negócio quando estiver pronto? 3–6 linhas. Evite solução aqui — descreva o problema._

- **Problema / oportunidade:**
- **Resultado pretendido (outcome):**
- **Resultado observável (como saberemos que funcionou, em 1 frase):**

## 2. Quem é impactado  *(Obrigatória)*

> _Personas/papéis afetados. No Painel Fix v2 pense em: dono/owner, admin, professor, e o aluno/pagador (indireto). Lembre que é multi-tenant (1 tenant = 1 escola)._

| Persona / papel | Como é impactada |
|---|---|
| | |

## 3. Escopo  *(Obrigatória)*

> _Seja explícito sobre o que NÃO entra — é o que mais evita retrabalho._

**Dentro (in):**
-

**Fora (out):**
-

**Premissas:**
-

## 4. Requisitos funcionais  *(Obrigatória)*

> _O comportamento observável do sistema. Um requisito por linha, com ID. Escreva de forma testável ("o sistema faz X quando Y"). Evite detalhe de implementação._

- **RF-1** —
- **RF-2** —
- **RF-3** —

## 5. Requisitos não-funcionais  *(Obrigatória)*

> _Qualidades transversais. Marque as que se aplicam e dê números quando possível._

- **RNF-1 (segurança/privacidade):** _ex.: respeitar isolamento multi-tenant (RLS por `current_tenant_id()`); nunca enviar `tenant_id` do frontend; permissão real vem do DB (RPC), não da sessão. Ver `README_ARQUITETURA.md`._
- **RNF-2 (permissões/acesso):** _quem pode ver/fazer o quê (owner/admin/professor)._
- **RNF-3 (performance):**
- **RNF-4 (i18n/UX):** _textos em pt-BR; estados de carregamento/erro/vazio._
- **RNF-5 (observabilidade):** _o que logar/medir._

## 6. Fluxo do usuário  *(Opcional, recomendado)*

> _Passo a passo do caminho feliz + principais alternativos. Pode ser lista numerada, link de protótipo (Figma) ou diagrama._

1.
2.

## 7. Modelo de dados & impacto técnico  *(Opcional)*

> _Resumo, não design completo. Novas tabelas/colunas, migrations previstas (db/migrations/AAAAMMDD_*.sql), rotas/API novas, gateways afetados (src/lib/...), integrações externas. Sinalize se mexe em RLS/RPC._

-

## 8. Critérios de aceite  *(Obrigatória)*

> _Lista verificável que define "pronto". Idealmente cada item rastreia um RF/RNF. Use checkboxes._

- [ ]
- [ ]
- [ ]

## 9. Como validar (verificação)  *(Obrigatória)*

> _Como provar que funciona de ponta a ponta: passos manuais, dados de teste, comandos. Diga o que será coberto por teste automatizado (vitest) e o que será manual. Se houver migration, descreva como aplicar/testar em ambiente seguro antes de produção._

1.
2.

## 10. Métricas de sucesso  *(Obrigatória)*

> _Como medimos o outcome depois de lançar. Métrica + meta + como/onde medir. Inclua uma "contra-métrica" (o que NÃO pode piorar)._

| Métrica | Meta | Como medir |
|---|---|---|
| | | |

## 11. Riscos & mitigações  *(Obrigatória)*

| Risco | Impacto | Mitigação |
|---|---|---|
| | | |

## 12. Rollout & operação  *(Opcional)*

> _Lançamento faseado? feature flag? backfill de dados existentes? plano de rollback? comunicação aos usuários? cron/jobs novos (vercel.json)?_

-

## 13. Dependências & questões em aberto  *(Obrigatória)*

> _Decisões pendentes (com responsável e prazo), dependências de terceiros/integrações, e o que ainda precisa ser respondido antes de começar._

- **Em aberto:**
- **Dependências:**

## 14. Fora de escopo / futuro  *(Opcional)*

> _Ideias relacionadas que ficam para depois — registra para não se perder e deixa claro que não entram agora._

-

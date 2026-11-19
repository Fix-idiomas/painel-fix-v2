# Auditoria de código — novembro/2026

Levantamento de bugs e inconsistências feito em 2026-11-13, para irmos corrigindo
com calma. Cada item tem **status**, **onde** está e **como foi confirmado**.

**Legenda de status:** ⬜ aberto · 🔧 em andamento · ✅ corrigido no código (falta deploy) ·
🚀 em produção · ⏸️ aguardando decisão · ❎ não será feito

**Legenda de confirmação:** **[confirmado]** reproduzido (teste, Node ou dados reais) ·
**[código]** visto na leitura do código · **[verificar]** depende de algo não versionado
(policy/RPC no banco).

---

## 🔴 Críticos

### C1. E-mail aberto para qualquer usuário logado (relay) — ✅
- **Correção:** `/api/send-mail` passou a exigir tenant, permissão `is_admin_or_finance_write`
  e `tenant_can_write()`, com limites de 10 destinatários, assunto e tamanho do corpo
  ([`mailPolicy.ts`](../src/lib/mailPolicy.ts), com testes). `/teste-email` foi bloqueada
  em produção no middleware. O handler de e-mail de `update-user-perms` foi removido (C2).
- **Onde:** [`api/send-mail`](../src/app/api/send-mail/route.ts),
  [`api/admin/update-user-perms`](../src/app/api/admin/update-user-perms/route.ts),
  página [`/teste-email`](../src/app/(app)/teste-email/page.jsx).
- **Problema:** basta estar logado (o signup é aberto) para mandar e-mail com `to`,
  `subject` e `html` livres pelo domínio Mailgun, usando a marca da escola. Não há
  checagem de tenant nem de permissão. `/teste-email` não é bloqueada em produção.
- **Risco:** phishing com a marca e suspensão do domínio no Mailgun. O repositório é
  **público**. **[código]**

### C2. "Editar permissões" não salva nada — ✅
- **Correção:** a rota agora atualiza `user_claims.perms` com o client do próprio usuário
  (sem service role; a RLS `is_admin_or_members_write` continua valendo) e exige
  `is_admin_or_owner`. Altera só `classes`, `finance` e `registry`; preserva as outras
  chaves (`meta`, `reports`…). Se a RLS afetar 0 linhas, devolve 403, nunca um falso
  sucesso ([`permsPolicy.ts`](../src/lib/permsPolicy.ts), com testes).
- **Onde:** [`conta/page.jsx:1249`](../src/app/(app)/conta/page.jsx#L1249) →
  [`api/admin/update-user-perms`](../src/app/api/admin/update-user-perms/route.ts).
- **Problema:** a rota só envia e-mail. A tela manda `{ user_id, perms }`, a rota exige
  `to` e `subject` e responde 400. Nenhuma rota atualiza permissões. **[código]**

### C3. Pagante bloqueado no dia da renovação — ✅ código · 🚀 migration aplicada em prod (2026-11-19)
- **Correção:**
  1. Carência: a referência passa a depender do status (trial → `trial_end`; demais →
     `current_period_end`), no banco (`tenant_access_level`) e no front
     ([`entitlement.js`](../src/lib/entitlement.js), com testes).
  2. O cron `expire-subscriptions` só marca `past_due` **3 dias** depois do fim do
     período (é a rede de segurança; o webhook `PAYMENT_OVERDUE` é a fonte principal).
  3. O cron `subscription-dunning` avisa nos dias **1, 3 e 6** (antes, todo dia), com
     texto neutro (Pix ou cartão), a data do bloqueio e HTML escapado. As regras de datas
     ficam em [`billingSchedule.ts`](../src/lib/billingSchedule.ts), com testes.
- **Achado extra:** a RPC `subscription_dunning_targets` buscava o dono por
  `user_claims.role = 'owner'`, papel que o banco não aceita. Ela **nunca retornava
  ninguém**, ou seja, o e-mail de assinatura em atraso nunca era enviado. Passa a usar
  `tenants.owner_user_id`.
- **Falta:** aplicar
  [`20261119_fix_billing_grace_and_dunning.sql`](../db/migrations/20261119_fix_billing_grace_and_dunning.sql).
  Hoje nenhum tenant é pagante (6 isentos e 3 com trial expirado), então aplicar não muda
  o acesso de ninguém. A ordem entre código e migration não importa.
- **Onde:** [`cron/expire-subscriptions`](../src/app/api/cron/expire-subscriptions/route.ts),
  [`20260621_entitlement_enforcement.sql:30`](../db/migrations/20260621_entitlement_enforcement.sql#L30),
  [`entitlement.js:42`](../src/lib/entitlement.js#L42),
  [`cron/subscription-dunning`](../src/app/api/cron/subscription-dunning/route.ts).
- **Problema:** é uma cadeia de três falhas:
  1. `current_period_end` = vencimento + 1 mês, e o cron (03h de Brasília) marca
     `past_due` no **próprio dia** do vencimento, sem carência.
  2. A carência de 7 dias usa `coalesce(trial_end, current_period_end)`. Todo tenant
     nasce com `trial_end`, e ninguém o limpa. Por isso o pagante vai direto para
     `blocked`, sem modo leitura.
  3. O dunning fala em "limite ou validade do cartão" também para quem paga com Pix,
     e reenvia todo dia. **[código]**

### C4. O webhook aplica eventos de outras assinaturas ao tenant — ✅
- **Correção:** um evento que traz id de assinatura é mapeado **só** por esse id. Se não
  bater com a assinatura atual (antiga ou órfã), o evento fica registrado mas não tem
  efeito. O fallback por `customer` só vale quando o evento não traz assinatura
  (`mappingStrategy`, com testes). Erros de leitura no mapeamento agora são propagados
  (antes eram ignorados).
- **Onde:** [`webhooks/asaas/route.ts:158`](../src/app/api/webhooks/asaas/route.ts#L158).
- **Problema:** quando o id da assinatura não bate, o código cai no fallback por
  `customer`, que é o mesmo do tenant. O reconcile, ou o `subscribe`, cancela uma
  assinatura órfã ou antiga, a Asaas avisa com `SUBSCRIPTION_DELETED`, e o tenant que
  está pagando vira `canceled` (só leitura). **[código]**

### C5. O `accept-invite` grava claim com tenant e perms da URL — ⬜ (rebaixado: não é brecha)
- **Onde:** [`accept-invite/page.jsx:47`](../src/app/(app)/accept-invite/page.jsx#L47).
- **Problema:** faz upsert em `user_claims` com `tenant` e `perms` vindos da query string.
- **Verificado no banco (2026-11-13):** o INSERT e o UPDATE em `user_claims` exigem
  `tenant_id = current_tenant_id() AND is_admin_or_members_write(tenant_id)`. Um convidado
  ainda não tem tenant, então a gravação é negada. **Não é vulnerável, mas a
  funcionalidade está morta.** A rota também não está na allowlist do paywall (M11).
- **A decidir:** remover a página ou implementar convites de verdade (token assinado,
  gravado no servidor).

---

## 🟠 Altos

### A1. A Prévia de mensalidades "não efetiva" — ✅
- **Correção:** a Prévia e o Gerar usam a mesma função (`pendingStudentsForMonth`): alunos
  ativos sem lançamento não cancelado no `competence_month`. A tela de Mensalidades não
  filtra mais pelas linhas visíveis. O modal mostra o erro por dentro, e a página mostra
  "N mensalidades geradas" ou "nenhuma nova". Isso também corrige a Prévia da tela
  **Financeiro**, que nem filtrava o que já existia.
- **Onde:** [`mensalidades/page.jsx:473`](../src/app/(app)/financeiro/mensalidades/page.jsx#L473),
  [`paymentGateway.ts`](../src/lib/gateways/paymentGateway.ts).
- **Problema:** a Prévia compara com as linhas **da tela** (chave aluno + vencimento,
  sujeita a filtro e ao limite de 50). O "Gerar" compara no banco por
  `competence_month`. Quando os dois divergem, o modal oferece alunos que o gerador
  pula, e a tela não lê o retorno `{ inserted: 0 }`. Os erros do insert caem num banner
  escondido atrás do modal.
- **[confirmado]** com dados da Fix Idiomas: novembro/2026 tem **51** mensalidades e a
  lista carrega **50**. Com 21 empatadas no vencimento 25/11, a que fica de fora muda a
  cada carregamento.

### A2. Lista de mensalidades limitada a 50, com KPIs calculados só sobre elas — ✅
- **Correção:** sem `pageSize`, o `listPayments` traz o mês inteiro (paginando de 1000 em
  1000) e ordena por `due_date, id`, para o resultado ser estável. Com `pageSize`, respeita
  a página pedida. Cobre também o `getCombinedRevenueKpis`.
- **Onde:** [`paymentGateway.listPayments`](../src/lib/gateways/paymentGateway.ts#L188)
  (`pageSize = 50`; o `financeGateway` não repassa `page`).
  O `getCombinedRevenueKpis` herda o mesmo corte. **[confirmado]**

### A3. Janela de mês errada no fuso de Brasília — ✅
- **Correção:** novo helper `nextMonthStartOf` (aritmética de string), usado em
  `paymentGateway.listPayments` e em `financeKpisGateway.getMonthlyFinanceKpis`.
  Coberto por testes de fevereiro, março, abril e dezembro.
- **Onde:** [`paymentGateway.ts:202`](../src/lib/gateways/paymentGateway.ts#L202)
  (`new Date("YYYY-MM-01")` seguido de `setMonth` local).
- **[confirmado]** com Node (`TZ=America/Sao_Paulo`): fevereiro vai até 03/03, março
  corta no dia 28, abril inclui 1 e 2 de maio e dezembro perde o dia 31.

### A4. Aulas a partir das 21h são apagadas pelo prune — ✅
- **Onde:** [`turmaGateway.pruneSessionsNotInRules`](../src/lib/gateways/turmaGateway.ts#L505).
- **Problema:** usa `getUTCDay()` num horário local. Aulas às 21h ou depois caem no dia
  seguinte em UTC e são apagadas como "fora da regra". **[confirmado]** com Node.
- **Feito (2026-11-19):** o prune usa `weekdayInTz` (dia da semana em SP). Nenhuma turma tinha
  aula às 21h+ em produção, então nenhuma aula foi perdida.

### A5. `Guard.jsx` chama hooks depois de um `return`, e o lint ignora `.js` e `.jsx` — 🔧
- **Feito:** os hooks do `Guard` vieram para o topo (o lint nos JSX agora passa).
- **Falta:** fazer o `eslint.config.mjs` cobrir `.js` e `.jsx`. Ao ligar, aparecem 5 erros
  antigos (`no-unescaped-entities`, `no-html-link-for-pages`) para limpar junto.
- **Onde:** [`Guard.jsx:38`](../src/components/Guard.jsx#L38) e
  [`eslint.config.mjs`](../eslint.config.mjs). Quebra quando `session` volta a `null`
  (logout). O `npm run lint` não analisa nenhum `.js` ou `.jsx`, que é quase toda a UI.
  **[confirmado]** rodando o ESLint nos JSX.

### A6. A Prévia manual e o cron geram mensalidades com regras diferentes — ✅
- **Feito:** vencimento limitado a 28 (`dueDateFor`); duplicata em lote tratada linha a
  linha (o `code` cru é lido antes do `mapErr`); retorno sempre
  `{ inserted, skipped_existing, created_payers }`; testes cobrindo esses casos.
- **Decidido (2026-11-19):** (a) a Prévia **não** recria mês cancelado — conta como
  "já existe", igual ao cron; para cobrar de novo usa-se "Reabrir" na mensalidade (já
  existia). (b) Aluno cadastrado no meio do mês **entra** na Prévia manual de propósito:
  ela cobre justamente quem o cron do dia 01 não alcança. Diferença intencional, documentada
  no código.
- **Onde:** [`paymentGateway.generateMonth`](../src/lib/gateways/paymentGateway.ts#L71) e
  [`server/monthlyGeneration.ts`](../src/lib/server/monthlyGeneration.ts).
- **Problema:**
  - A Prévia ignora as canceladas, então recria mensalidades canceladas.
  - Não aplica a regra de "aluno cadastrado no meio do mês".
  - Não limita o vencimento a 28.
  - O tratamento de duplicata (`23505`) nunca roda, porque o `mapErr` descarta o `code`;
    uma duplicata derruba o lote inteiro.
  - O tipo de retorno varia: objeto ou array. **[código]**

### A7. O cron `dunning-reminders` cobra todo dia, para sempre — ✅ código · 🚀 migration aplicada (2026-11-19)
- **Onde:** [`cron/dunning-reminders`](../src/app/api/cron/dunning-reminders/route.ts).
- **Problema:**
  - Não consulta `finance_reminders_log`, então reenvia o mesmo lembrete diariamente.
  - O texto diz "referente ao mês atual" para atrasos de qualquer mês.
  - Corta em 1000 linhas (padrão do PostgREST).
  - Cobra alunos de escolas que já cancelaram a assinatura.
  - Compara o secret sem tempo constante. **[código]**
- **Feito (2026-11-19):** no máximo 3 lembretes automáticos por mensalidade, a cada 7
  dias (`src/lib/reminderPolicy.ts`), com histórico em `finance_reminders_log`; só
  escolas com acesso pleno; e-mail inválido ignorado; texto sem "mês atual"; paginação;
  "hoje" em SP; nomes escapados; secret em tempo constante.
- **Achado extra:** o lembrete manual da tela nunca gravava o histórico (status `error`
  fora do check, `sent_at` nulo, `tenant_id` enviado pelo frontend). Corrigido; exige a
  migration `20261119_finance_reminders_log_tenant_default.sql` (DEFAULT no `tenant_id`).

### A8. Os e-mails de cobrança saem como "Fix Idiomas" para todas as escolas — ⬜
- **Onde:** [`SessionContext.jsx`](../src/contexts/SessionContext.jsx) (o `tenantName`
  nunca é lido do banco), usado em
  [`mensalidades/page.jsx:168`](../src/app/(app)/financeiro/mensalidades/page.jsx#L168). **[código]**

### A9. Aluno inativo continua com mensalidades pendentes — ❎ (comportamento correto)
- **Observação:** inativar só muda o status; as pendências que já existem continuam.
  Em 2026-11-13 eram 38 pendências de alunos inativos (35 da Fix Idiomas, R$ 8.353,00,
  de 10/2025 a 11/2026; 3 da Escola Caos).
- **Decisão final (2026-11-19):** isso é **intencional**. Aluno que sai devendo continua
  com o débito. As pendências só são canceladas **manualmente**, em Mensalidades. A regra
  é: **aluno inativo não recebe cobranças novas.** Isso já é garantido, porque o cron
  (`monthlyGeneration`) e a Prévia/Gerar (`pendingStudentsForMonth`) só geram para
  `status = 'ativo'`.
- **Atenção operacional:** se o aluno for inativado no meio do mês, a mensalidade daquele
  mês (gerada no dia 1) continua pendente e precisa ser cancelada à mão, se não for devida.
- **Histórico:** um trigger que cancelava as pendências automaticamente chegou a ser
  escrito e testado com `ROLLBACK` (funcionou, nada foi gravado), mas foi **descartado**
  com a mudança de decisão. Não há migration.
- **Melhoria possível (não feita):** ao inativar, mostrar as pendências do aluno com um
  botão opcional "cancelar as selecionadas".

---

## 🟡 Médios

| # | Problema | Onde | Status |
|---|----------|------|--------|
| M1 | "Hoje" e "mês atual" em UTC em cerca de 15 lugares (o CLAUDE.md manda usar `tzToday`). Depois das 21h de Brasília, os atrasos contam um dia antes e o seletor de mês pula. | painel, mensalidades, gastos, financeiro, outras-receitas, turmas, professores, `financeKpisGateway`, crons | ✅ `src/lib/tz.ts` (`todaySP`/`currentMonthSP`) em páginas, gateways, `subscribe` e `monthly-previa` |
| M2 | O KPI de despesas soma os lançamentos cancelados (a receita os exclui). | [`financeKpisGateway.ts:46`](../src/lib/gateways/financeKpisGateway.ts#L46) | ✅ canceladas fora do total e do detalhamento por centro de custo |
| M3 | O repasse do professor usa dois critérios: o total por `teacher_id_snapshot`, a lista por `turmas.teacher_id`. | [`teacherGateway.ts`](../src/lib/gateways/teacherGateway.ts) | ⬜ |
| M4 | O `createOtherRevenueTemplate` apaga colunas (como `end_month`) quando dá erro, e uma receita "até o mês X" vira indefinida. | [`otherRevenueGateway.ts:60`](../src/lib/gateways/otherRevenueGateway.ts#L60) | ⬜ |
| M5 | O `deleteTurma` apaga todo o histórico de aulas, sem atomicidade, e muda repasses e relatórios passados. | [`turmaGateway.ts:121`](../src/lib/gateways/turmaGateway.ts#L121) | ⬜ |
| M6 | Open redirect no login: `router.replace(next)` sem validar. | [`login/page.jsx:87`](../src/app/(auth)/login/page.jsx#L87) | ✅ [`safeNextPath`](../src/lib/safeNextPath.js) (com testes) |
| M7 | `create-user`: tenant escolhido por `owner_user_id` com `limit(1)`; o front envia `tenant_id`; uma falha parcial deixa o login órfão (depois dá 409). | [`admin/create-user`](../src/app/api/admin/create-user/route.ts) | ⬜ |
| M8 | O `subscribe` sem linha em `subscriptions` cria a assinatura na Asaas sem gravar nada, e o reconcile não a vê. `nextDueDate` em UTC. | [`billing/subscribe`](../src/app/api/billing/subscribe/route.ts) | ⬜ |
| M9 | Cancelar a assinatura deixa o tenant só com leitura na hora, mesmo com período pago. | [`billing/cancel`](../src/app/api/billing/cancel/route.ts) | ⏸️ decisão de produto |
| M10 | No cartão, um `PAYMENT_RECEIVED` atrasado pode fazer o `current_period_end` voltar um mês (plausível). | [`asaasWebhook.ts`](../src/lib/asaasWebhook.ts) | ✅ `CONFIRMED`/`RECEIVED`/`OVERDUE` de cobrança anterior ao período vigente ficam registrados sem efeito (`isStalePaymentEvent`); estornos continuam valendo |
| M11 | Paywall: `/accept-invite` e `/reset-password` estão em `(app)` mas fora da allowlist, então um convidado ou um tenant bloqueado cai em `/assinatura`. | [`paywallRoutes.js`](../src/lib/paywallRoutes.js) | ⬜ |
| M12 | `Guard` com `check` inline refaz a RPC a cada render do layout. | [`Guard.jsx`](../src/components/Guard.jsx) | ⬜ |

## 🔵 Baixos e consistência

| # | Problema | Status |
|---|----------|--------|
| B1 | Matcher do middleware: o `\.` dentro da string vira `.`, e o lookahead não tem âncora no fim. | ⬜ |
| B2 | Algumas rotas devolvem a mensagem crua do Postgres; o `subscribe` usa mensagem genérica. | ⬜ |
| B3 | O HTML dos e-mails não escapa nomes de aluno, pagador e escola. | 🔧 escapado no `subscription-dunning`; falta no `dunning-reminders` e em Mensalidades |
| B4 | O banco aceita `role` ∈ {admin, user}; o CLAUDE.md e o `SessionContext` falam em `member`. | ⬜ |
| B5 | A RPC `can_registry_read` (em `cadastro/page.jsx`) não aparece em nenhuma migration; a tela tem guard duplo. | ⬜ |
| B6 | `EmailModal.jsx` é código morto e contém `innerHTML`. | ⬜ |
| B7 | Um comentário de migration diz trial de 14 dias, mas o código grava 30 (corrigido depois para 14). | ⬜ |
| B8 | 10 páginas acessam o Supabase direto, fora da camada de gateways, e 4 arquivos importam o barrel `supabaseGateway`. | ⬜ |
| B9 | O Vitest falha quando o terminal abre a pasta como `c:\` (minúsculo); rodar a partir de `C:\`. | ⬜ |
| B10 | `npm audit`: 19 vulnerabilidades (2 críticas); `@supabase/auth-helpers-nextjs` deprecado. | ⬜ |
| B11 | A pasta `supabase/.temp/` (criada pelo `supabase link`) não está no `.gitignore`. | ✅ |

---

## Histórico

- **2026-11-13** — auditoria inicial; diagnóstico da Prévia com dados reais (A1);
  decisão e migrations de A9 (não aplicadas).
- **2026-11-13** — 1º lote no código (sem commit nem deploy): C1, C2, A1, A2, A3, M2 e M6
  corrigidos; A5 e A6 parciais; C5 verificado no banco e rebaixado. `tsc` limpo, lint
  limpo, 293 testes passando.
- **2026-11-19** — lote 1 na branch `fix/auditoria-lote-1`, com deploy de preview.
  A9 revisto: as pendências de aluno inativo **não** são canceladas automaticamente
  (o débito continua; o cancelamento é manual). As migrations do trigger e do backfill
  foram removidas.
- **2026-11-19** — lote 2 (cobrança): C3 (código e migration ainda não aplicada), C4 e
  M10 corrigidos; B3 parcial. Achado extra: o dunning de assinatura nunca enviava (RPC
  procurava `role = 'owner'`). 313 testes passando.
- **2026-11-19** — migration `20261119_fix_billing_grace_and_dunning.sql` testada com
  rollback (pagante 2d → readonly, 8d → blocked; dunning encontra o owner) e aplicada em
  produção. Preview atualizado com lotes 1+2.
- **2026-11-19** — lotes 1 e 2 em produção (PR #5, https://fixdash.com.br). A6 decidido e
  corrigido: a Prévia deixa de recriar mês cancelado; aluno do meio do mês segue entrando.
- **2026-11-19** — **A10 (novo, relatado pelo usuário):** "Registrar" aula no Dashboard dava
  "Algum campo foi preenchido em um formato inválido". O id da turma era extraído com
  `split("-")[0]`, que corta o UUID no primeiro hífen. Mesmo erro ao clicar numa aula
  prevista na Agenda (modal abria sem a turma certa). Corrigido: eventos carregam `turmaId`;
  aula já registrada mostra mensagem clara. ✅

# Débitos técnicos

Itens conhecidos, deliberadamente adiados, com contexto suficiente para serem
retomados no futuro. Cada item registra: severidade, por que foi adiado, o
impacto atual, a correção proposta e o gatilho para tratá-lo.

> Não precisa ler agora — mas **consulte antes de mexer em finanças, billing, RLS ou
> onboarding**.

## Status (abertos primeiro)

| ID | Severidade | Aberto? | Resumo | Gatilho |
|----|-----------|---------|--------|---------|
| TD-3 | 🟡 baixa/média | ⬜ aberto | critério único de mês p/ despesas (`due_date` vs `competence_month`) | mexer em despesas/relatórios |
| TD-4 | 🟢 baixa | ⬜ aberto | `cost_center` 100% server-side em `listExpenseEntries` | tocar o gateway de despesas |
| TD-5 | 🟢 baixa | ⬜ aberto | naming (`annual`/`yearly`) + datas SSR/CSR | oportunístico |
| TD-6 | 🟢 baixa | ⬜ aberto | seed órfão `Fix Idiomas` (dados sem claims) | decisão do produto |
| TD-7 | 🟢 baixa | ⬜ aberto | sem sync de `owner_user_id` na revogação de claim | gestão de titularidade |
| TD-8 | 🟢 baixa | ⬜ aberto | mock do Supabase cego a args de filtro | endurecer suíte de gateways |
| TD-9 | 🟢 baixa | ⬜ aberto | `getCombinedRevenueKpis` usa "hoje" UTC, não SP | tocar KPIs de receita |
| TD-10 | 🟢 baixa | ⬜ aberto | polimento UX em `/relatorios` e `/painel` | próxima iteração de UX |
| TD-1 | 🟠 média | ✅ resolvido | idempotência de reassinatura (billing) | — |
| TD-2 | 🟠 média | ✅ resolvido | reconciliação de assinaturas órfãs (Asaas) | — |

---

## TD-1 — Idempotência de reassinatura concorrente (billing/subscribe) — ✅ RESOLVIDO (jun/2026)

- **Severidade:** 🟠 média
- **Origem:** PRD-3, revisão de segurança/QA do backend Pix (jun/2026)
- **Local:** [`src/app/api/billing/subscribe/route.ts`](../src/app/api/billing/subscribe/route.ts)
- **Resolução:** **claim atômico** (NÃO índice único parcial — `subscriptions` tem
  1 linha por tenant, então o duplicado é na Asaas, não em linhas). Migration
  `db/migrations/20260626_subscribe_claim.sql` adiciona `checkout_claim_at` + a
  função `claim_checkout(uuid)` (SECURITY DEFINER, só service_role): UPDATE
  condicional (`status<>'active' AND (checkout_claim_at IS NULL OR < now()-90s)`)
  que trava a linha no Postgres → só 1 request vence; o perdedor recebe 409. A
  janela de 90s é avaliada no servidor (sem timestamp na query string) e expira
  sozinha; o claim é liberado no sucesso (persist) e em qualquer falha (try/finally).
  **Pendente: aplicar a migration na prod ANTES do deploy da rota.**

### Problema (resolvido)
Sem idempotência, dois cliques concorrentes de reassinatura (trial/past_due/
canceled/expired) podiam criar **duas assinaturas na Asaas** (uma órfã). O claim
atômico serializa: só 1 request vence; o outro recebe 409.

### Verificação ao tratar (recomendada no go-live, em sandbox)
Concorrência real não é coberta pelo mock (Supabase mockado não modela row lock).
Validar contra Postgres real: 2 `claim_checkout(tenant)` em paralelo → exatamente
1 retorna true. Boundary da janela: `checkout_claim_at = now()-91s` permite
re-claim; `now()-89s` nega. Revisado por engenheiro sênior (✅ aprovado) e QA.

---

## TD-2 — Reconciliação de assinaturas órfãs na Asaas — ✅ RESOLVIDO (jun/2026)

- **Severidade:** 🟠 média (latente; impacto atual ZERO — todas as contas isentas)
- **Origem:** revisão de QA do TD-1 (jun/2026)
- **Local:** [`src/app/api/cron/reconcile-subscriptions/route.ts`](../src/app/api/cron/reconcile-subscriptions/route.ts), [`src/lib/subscriptionReconcile.ts`](../src/lib/subscriptionReconcile.ts), [`src/lib/asaas.ts`](../src/lib/asaas.ts)
- **Resolução:** **cron de reconciliação** (`reconcile-subscriptions`, diário 06:30 no
  vercel.json) que varre tenants com customer Asaas, lista as assinaturas por
  `externalReference` e cancela as **extras**. Lógica pura `reconcilePlan` (testada):
  conservadora — só cancela quando a verdadeira (`asaas_subscription_id`) está
  confirmada entre as ativas; caso ambíguo (id nulo OU não encontrado) → **revisão
  manual logada, não cancela**. Pula tenants com checkout em andamento (claim < 5min)
  para não cancelar assinatura legítima ainda não persistida.
- **Verificação ao tratar (go-live, sandbox):** matar a função entre create e
  persist; rodar o cron; confirmar que a órfã é cancelada e a legítima preservada.
  O caso ambíguo (stored nulo + 1 órfã de trial) sai como "revisão manual".
  **Crítico:** confirmar que `GET /subscriptions?externalReference=` filtra
  server-side (senão `listSubscriptions` traria subs de outros tenants → único
  caminho teórico p/ cancelar de outro tenant). O mesmo filtro já é usado e
  validado em `getOrCreateCustomer` (customers), o que dá confiança. Falta também
  teste do route handler (auth 401, skip por claim recente, agregação).

### Problema
`createSubscription` **não é idempotente** (diferente de `getOrCreateCustomer`,
que busca por `externalReference` antes de criar). Duas janelas geram assinatura
órfã na Asaas (cobrando o cliente sem registro local consistente):
1. **Timeout serverless**: se a função morre (maxDuration 30s) entre `createSubscription`
   ter criado na Asaas e o persist, o `finally` não roda; passados 90s, um retry
   cria uma **2ª** assinatura (a 1ª fica órfã). O claim do TD-1 NÃO cobre isto
   (a criação já aconteceu antes da morte).
2. **Dupla-falha**: se o persist falha E o `cancelSubscription` de compensação
   também falha (rede), a sub recém-criada fica órfã ativa.

### Por que adiar
Raro (exige morte no intervalo create→persist) e **impacto atual zero** (ninguém
não-isento usa o fluxo). A correção certa é não-trivial: `externalReference=tenantId`
é **compartilhado** entre a assinatura antiga e a nova, então "getOrCreate por
externalReference" não distingue qual reutilizar — precisa de lógica de reconciliação.

### Correção proposta
- **Reconciliação**: cron/rotina que lista assinaturas Asaas por `externalReference`
  e cancela as que não batem com `subscriptions.asaas_subscription_id` do tenant
  (espelha o padrão dos crons existentes, service-role). OU
- **Create idempotente**: antes de criar, listar subs Asaas por `externalReference`
  excluindo `oldSubId` e canceladas; reutilizar uma pendente se existir.
- Alertar/logar a órfã na dupla-falha de compensação para limpeza manual.

### Verificação ao tratar (sandbox)
Matar a função entre create e persist; confirmar que a reconciliação cancela a 1ª
e não deixa 2 assinaturas ativas. Testar dupla-falha (persist + cancel falham).

---

## TD-3 — Critério único de mês para despesas (`due_date` vs `competence_month`)

- **Severidade:** 🟡 baixa/média
- **Origem:** herdado do antigo `README_ARQUITETURA.md` §6
- **Local:** `src/lib/gateways/expenseGateway.ts`, `financeKpisGateway.ts`
- **Problema:** despesas usam `competence_month` em alguns pontos e `due_date` em
  outros para "o mês". Falta um critério único documentado, o que pode divergir
  relatório de KPI.
- **Correção proposta:** escolher um critério (ideal: `due_date`), alinhar todas as
  queries e documentar. Enquanto não unificado, confira o gateway antes de assumir.
- **Gatilho:** próxima mudança relevante no financeiro/relatórios de despesas.

## TD-4 — Filtro `cost_center` 100% no servidor em `listExpenseEntries`

- **Severidade:** 🟢 baixa
- **Origem:** `README_ARQUITETURA.md` §6
- **Problema:** parte da filtragem por `cost_center` ainda ocorre fora do server.
- **Correção proposta:** empurrar o filtro inteiro para a query (server-side).
- **Gatilho:** ao tocar `expenseGateway.listExpenseEntries`.

## TD-5 — Padronização de naming e datas SSR/CSR

- **Severidade:** 🟢 baixa
- **Itens:** `annual` vs `yearly` (recorrência); formatação de datas consistente
  entre SSR e CSR.
- **Gatilho:** oportunístico, ao mexer nas áreas afetadas.

## TD-6 — Seed órfão `Fix Idiomas` (`11111111-1111-4111-8111-111111111111`)

- **Severidade:** 🟢 baixa (inerte)
- **Origem:** revisão (senior/QA) do backfill de `owner_user_id` (jul/2026)
- **Estado:** tenant de seed com dados (8 alunos, 41 pagamentos, 5 turmas) mas **0
  `user_claims`** e `owner_user_id` NULL. Ninguém consegue acessá-lo (RLS bloqueia sem
  claim) — dados órfãos-porém-inalcançáveis, não vazados.
- **Decisão pendente:** adotar (vincular um usuário) ou purgar os dados de seed.
  Deliberadamente fora do escopo do backfill (não há usuário para atribuir, e apagar é
  destrutivo). Documentado no cabeçalho de `db/migrations/20260708_backfill_tenant_owner_user_id.sql`.
- **Gatilho:** decisão explícita do dono do produto.

## TD-7 — Sem sincronização de `owner_user_id` na revogação de claim

- **Severidade:** 🟢 baixa
- **Origem:** revisão de QA do backfill (jul/2026)
- **Problema:** se o admin que virou owner tiver o claim revogado depois, nada
  atualiza `tenants.owner_user_id`. Owner apontaria para um usuário sem claim.
- **Correção proposta:** feature de **transferência de titularidade** (e/ou trigger de
  sincronização) quando houver gestão de owner. Fora de escopo hoje.
- **Gatilho:** ao implementar gestão de titularidade/ownership.

## TD-8 — Mock do Supabase é "cego" aos argumentos de filtro

- **Severidade:** 🟢 baixa (limite de teste, não bug de produção)
- **Origem:** revisão de QA da rodada de testes de gateway (jul/2026)
- **Problema:** `supabaseMock` devolve o resultado por tabela **ignorando** os args de
  `.eq()/.in()/.gte()`. Testes validam a **agregação**, não a **corretude da query**
  (ex.: passar os ids errados ao `.in()` não é pego automaticamente).
- **Mitigação atual:** asserções em `mock._calls` onde a corretude do filtro importa.
- **Correção proposta:** evoluir o mock para filtrar por args, ou padronizar asserções
  de `_calls` nos gateways sensíveis.
- **Gatilho:** ao endurecer a suíte de gateways.

## TD-9 — `getCombinedRevenueKpis` usa "hoje" em UTC, não fuso SP

- **Severidade:** 🟢 baixa (latente)
- **Origem:** code review sênior (jul/2026)
- **Local:** `src/lib/gateways/financeKpisGateway.ts` (`getCombinedRevenueKpis`)
- **Problema:** classifica overdue/upcoming contra `new Date().toISOString()` (UTC),
  enquanto o resto do módulo usa `tzToday('America/Sao_Paulo')`. Perto da virada de dia
  UTC, um vencimento "hoje SP" pode cair no bucket errado. Não introduzido por mudança
  recente.
- **Correção proposta:** usar `tzToday('America/Sao_Paulo')` como referência.
- **Gatilho:** ao tocar os KPIs combinados de receita.

## TD-10 — Polimento de UX pendente em `/relatorios` e `/painel`

- **Severidade:** 🟢 baixa
- **Origem:** revisão de UX (jul/2026)
- **Itens:** empty-state dedicado quando o período inteiro é zero (hoje renderiza
  barras invisíveis em vez de mensagem); sparkline placeholder do `/painel` que simula
  dados quando não há pagamentos; asserção do `.in()` no mock (ver TD-8).
- **Gatilho:** próxima iteração de UX nos relatórios/painel.

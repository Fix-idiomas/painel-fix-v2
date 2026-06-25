# PRD-2 — Integração Asaas (cobrança recorrente + webhooks)

> **Status:** proposto · **Sequência:** 2 de 3 · **Depende de:** PRD-1 · **Habilita:** PRD-3
> Ver visão geral e decisões travadas no [README dos PRDs](README.md).

## 1. Contexto & objetivo

Com a fundação de entitlement pronta (PRD-1), este PRD **conecta a Asaas** para transformar trials em **assinaturas pagas recorrentes no cartão de crédito**. Inclui o helper de API, o **webhook** que mantém a tabela `subscriptions` como fonte da verdade, e as **rotas server** que criam/cancelam a assinatura.

**Resultado observável:** um owner em trial assina (cartão) e seu tenant vira `active`; quando a Asaas confirma a cobrança mensal, o webhook mantém `active`; em atraso/cancelamento, o webhook move para `past_due`/`canceled` e o paywall do PRD-1 bloqueia.

> **Fecha a lacuna do PRD-1 (achado C1 da revisão):** no PRD-1 o paywall é apenas um gate de **UI** — um tenant sem assinatura ainda alcança os dados via API/PostgREST. Este PRD torna o entitlement uma **fronteira de verdade no banco** (RLS/RPC), para que parar de pagar realmente bloqueie o acesso aos dados.

## 2. Escopo

**In:**
- Helper `src/lib/asaas.ts` (cliente HTTP da Asaas).
- Webhook `src/app/api/webhooks/asaas/route.ts` com idempotência e mapeamento de tenant.
- Rotas `src/app/api/billing/subscribe` e `src/app/api/billing/cancel`.
- **Enforcement de entitlement no banco** (achado C1): função SQL + aplicação em RLS/RPC das tabelas sensíveis, para bloquear dados de tenant sem assinatura.
- **Preenchimento de `current_period_end`** pelo webhook (achado A1), destravando a transição `active→past_due` do cron do PRD-1.
- Env vars e documentação (`README_INTEGRACOES.md`, `CLAUDE.md`).
- Testes em **sandbox Asaas**.

**Out:**
- UI rica de checkout/gestão (PRD-3) — aqui a `/assinatura` consome as rotas, mas o polimento de UX é do PRD-3.
- Cobrança por seat (preparado no schema do PRD-1).
- Pix/boleto recorrente (futuro).

## 3. Requisitos funcionais

- **RF-1** — `getOrCreateCustomer({ name, email, cpfCnpj, tenantId })`: busca por `externalReference=tenantId`; se não existir, cria. Persiste `asaas_customer_id` em `subscriptions`.
- **RF-2** — `createCardSubscription(...)`: cria assinatura `cycle:'MONTHLY'` no cartão (token ou hosted), com `externalReference=tenantId`. Persiste `asaas_subscription_id` e `payment_method='credit_card'`.
- **RF-3** — `getSubscription(id)` e `cancelSubscription(id)` para reconciliação e cancelamento.
- **RF-4** — Webhook autentica comparando o header `asaas-access-token` com `ASAAS_WEBHOOK_TOKEN` (comparação de tempo constante); rejeita **401** se inválido.
- **RF-5** — Webhook é **idempotente**: registra `subscription_events.asaas_event_id` (unique); evento repetido → **200** sem reprocessar.
- **RF-6** — Webhook mapeia evento → tenant resolvendo `subscriptions` por `asaas_subscription_id` (fallback `asaas_customer_id`). **Nunca** confia em `tenant_id` do payload.
- **RF-7** — Transições de status acionadas por evento (escrita via service role). Contas com `billing_exempt = true` (PRD-1) são **registradas em `subscription_events`** para auditoria, mas o `status` **não é rebaixado** (nunca viram `past_due`/`canceled` por cobrança):
  - `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → `status='active'`, atualiza `current_period_start/end`.
  - `PAYMENT_OVERDUE` → `status='past_due'`.
  - `PAYMENT_REFUNDED` / `PAYMENT_CHARGEBACK` → `status='past_due'` ou `canceled` (política).
  - `SUBSCRIPTION_DELETED` / `SUBSCRIPTION_INACTIVATED` → `status='canceled'`.
- **RF-8** — `POST /api/billing/subscribe` (auth por cookie de sessão): verifica sessão, **confere owner/admin via RPC** (não pela sessão), chama `getOrCreateCustomer` + `createCardSubscription`, persiste ids, atualiza status. Retorna dados para a UI disparar `refreshSession()`.
- **RF-9** — `POST /api/billing/cancel`: owner/admin → `cancelSubscription` + atualiza status.
- **RF-10** — Toda alteração de status grava um registro em `subscription_events` (auditoria), inclusive ações iniciadas pelas rotas de billing.
- **RF-11 (C1 — enforcement no banco)** — Criar função `tenant_has_entitlement()` (`SECURITY DEFINER`, lê a `subscriptions` do tenant atual; regra idêntica ao `hasEntitlement` do PRD-1: `billing_exempt` OU `active` OU `trial` não vencido). Aplicá-la como **fronteira de dados**, não só de UI, acrescentando `AND public.tenant_has_entitlement()` às policies RLS das tabelas de negócio (e/ou roteando mutações por RPCs `SECURITY DEFINER` que dão `RAISE EXCEPTION` quando bloqueado). **Escopo = bloqueio total** (alinhado à decisão do [README](README.md)): tanto registro quanto financeiro, em leitura e escrita — exceto uma **allowlist** de tabelas necessárias à tela de pagamento/conta (ver §5.4). O `SubscriptionGuard` (PRD-1) continua como **caminho primário de UX**; o banco é a **rede de segurança**. Contas com `billing_exempt=true` continuam liberadas (a função já cobre).
- **RF-12 (A1 — período preenchido)** — Em `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`, o webhook **deve** preencher `current_period_start` e `current_period_end` com as datas do ciclo retornadas pela Asaas. Sem isso, a transição `active→past_due` do cron `expire-subscriptions` (PRD-1) fica inerte (`NULL < now()` nunca casa). No fluxo normal, cada confirmação **empurra** `current_period_end` para o futuro; o rebaixamento primário em atraso é o evento `PAYMENT_OVERDUE` (RF-7), e o cron é apenas **backstop** para o caso de esse webhook se perder.

## 4. Requisitos não-funcionais

- **RNF-1 (PCI)** — Usar **checkout hospedado** da Asaas **ou** cartão **tokenizado**; **nunca** persistir PAN/CVV (mantém escopo PCI SAQ-A). Decisão default: hosted/tokenized.
- **RNF-2 (segurança)** — Webhook e rotas de billing escrevem via **service role**; `tenant_id` sempre derivado do mapeamento armazenado ou da sessão autenticada, nunca do corpo. `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY` são **server-only**.
- **RNF-3 (confiabilidade)** — Webhook sempre responde **2xx** quando o evento foi recebido/registrado (mesmo duplicado), para evitar re-tentativas infinitas da Asaas. Erros internos retornam 5xx só quando reprocessar é seguro.
- **RNF-4 (ambientes)** — `ASAAS_BASE_URL` separa **sandbox** (`https://api-sandbox.asaas.com/v3`) de **prod** (`https://api.asaas.com/v3`); chaves distintas por ambiente.
- **RNF-5 (propagação)** — Após `subscribe`, a UI chama `supabase.auth.refreshSession()` para o claim refletir `active` sem esperar o TTL do token.

## 5. Arquitetura

### 5.1 Helper `src/lib/asaas.ts`

Espelha [src/lib/mailgun.ts](../../src/lib/mailgun.ts): `fetch`, env-driven, retorna `{ ok, ... }`, sem SDK.

```ts
// Env (server-only): ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, ASAAS_BASE_URL
// Header de auth da API Asaas: { access_token: ASAAS_API_KEY }

export async function getOrCreateCustomer(input): Promise<{ ok; customerId?; error? }>
export async function createCardSubscription(input): Promise<{ ok; subscriptionId?; status?; error? }>
export async function getSubscription(id): Promise<{ ok; subscription?; error? }>
export async function cancelSubscription(id): Promise<{ ok; error? }>
export async function tokenizeCard(input): Promise<{ ok; creditCardToken?; error? }> // opcional
export function verifyWebhook(req): boolean   // compara header asaas-access-token
```

Chamadas Asaas usadas: `GET/POST /customers`, `POST /subscriptions`, `GET /subscriptions/{id}`, `DELETE /subscriptions/{id}`, (`POST /creditCard/tokenize` opcional).

### 5.2 Webhook `src/app/api/webhooks/asaas/route.ts`

Padrão service-role do cron ([dunning-reminders](../../src/app/api/cron/dunning-reminders/route.ts)):
1. `verifyWebhook(req)` → 401 se inválido.
2. Parse do evento; tentar `insert` em `subscription_events` (idempotência por `asaas_event_id`); se conflito → **200** e encerra.
3. Resolver tenant via `subscriptions` (por `asaas_subscription_id`/`asaas_customer_id`).
4. Aplicar transição (RF-7) com service role; atualizar `updated_at`.
5. Responder **200**.

### 5.3 Rotas de billing `src/app/api/billing/*`

Auth por cookie de sessão, como [student-insights](../../src/app/api/ai/student-insights/route.ts) (`createRouteHandlerClient`). Conferir owner/admin via RPC (mesmo padrão de `is_admin_or_*` / `is_owner` usado no `SessionContext`). Persistência via service role.

### 5.4 Enforcement de entitlement no banco (C1)

Migration nova (ex.: `db/migrations/<data>_entitlement_enforcement.sql`):

```sql
-- Fonte única de verdade do entitlement, no banco (espelha hasEntitlement do PRD-1).
create or replace function public.tenant_has_entitlement()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.tenant_id = current_tenant_id()
      and ( s.billing_exempt
         or s.status = 'active'
         or (s.status = 'trial' and (s.trial_end is null or s.trial_end >= now())) )
  );
$$;
```

**Notas de implementação da função:**
- É `SECURITY DEFINER` e o owner deve **ignorar a RLS de `subscriptions`** (evita recursão de policy ao ser chamada dentro de policies de outras tabelas). Testar explicitamente "ausência de recursão". `grant execute` para `authenticated`.
- **Performance:** nas policies, usar o padrão `(select public.tenant_has_entitlement())` — o `select` força o Postgres a avaliar **uma vez por statement** (initPlan/cache), em vez de por linha. Importante em tabelas grandes (`payments`).

**Escopo de aplicação (bloqueio total, com allowlist):**
- **Bloquear** (leitura e escrita) as tabelas de negócio: `payments`, `expense_entries`, `other_revenues`, `students`, `teachers`, `turmas`, `payers`, sessões/agenda, etc.
- **Allowlist (NÃO bloquear)** — necessárias para o tenant bloqueado conseguir se regularizar e operar a conta: `subscriptions` (leitura, já isolada por tenant), `tenant_settings` e `user_claims` (shell/sessão). As rotas `billing/subscribe|cancel` escrevem via **service role** (bypassam RLS), então o fluxo de pagamento continua funcionando mesmo bloqueado.
- Definir a lista fechada (tabela por tabela, operação) na implementação.

**Aplicação por tabela:** `AND (select public.tenant_has_entitlement())` nas policies; ou mutações via RPC `SECURITY DEFINER` com `if not (select tenant_has_entitlement()) then raise exception ... end if;`.

> **Rollout seguro (não impactar atuais):** como todas as contas atuais estão `billing_exempt=true` (PRD-1), `tenant_has_entitlement()` retorna `true` para elas — ligar o enforcement **não** bloqueia ninguém hoje; só passa a barrar novos inadimplentes. Ordem: aplicar a função → validar (inclusive anti-deadlock) → acoplar às policies tabela a tabela.
> **Kill-switch / rollback:** se o enforcement bloquear indevidamente em produção, reverter é `DROP POLICY`/recriar a policy sem o `AND tenant_has_entitlement()` (por tabela). Manter as policies do enforcement isoladas/identificáveis (nome próprio) para reversão rápida. Considerar uma flag global (ex.: setting que faz a função retornar `true`) como interruptor de emergência.

## 6. Arquivos a criar/alterar

**Criar:** `src/lib/asaas.ts`, `src/app/api/webhooks/asaas/route.ts`, `src/app/api/billing/subscribe/route.ts`, `src/app/api/billing/cancel/route.ts`, `db/migrations/<data>_entitlement_enforcement.sql` (C1).
**Alterar:** `src/app/(app)/assinatura/page.jsx` (ligar ao `subscribe`), policies/gateways das tabelas sensíveis (C1), [README_INTEGRACOES.md](../../README_INTEGRACOES.md) e [CLAUDE.md](../../CLAUDE.md) (env vars + fluxo). Configurar a URL do webhook no painel da Asaas.

## 7. Critérios de aceite (em sandbox Asaas)

- [ ] `subscribe` cria customer + subscription na Asaas (visíveis no painel sandbox) e persiste os ids em `subscriptions`.
- [ ] Após o pagamento de teste, a Asaas envia `PAYMENT_CONFIRMED` e o webhook seta `status='active'` + períodos.
- [ ] Reenviar o mesmo webhook **não** duplica efeito (idempotência via `asaas_event_id`); retorna 200.
- [ ] Webhook com `asaas-access-token` inválido → 401.
- [ ] Simular atraso → `PAYMENT_OVERDUE` → `status='past_due'` → paywall do PRD-1 bloqueia.
- [ ] `cancel` chama `DELETE /subscriptions/{id}` e seta `status='canceled'`.
- [ ] Nenhum dado de cartão (PAN/CVV) persistido em banco/logs.
- [ ] `tenant_id` nunca lido do corpo do webhook (revisão de código).
- [ ] **(C1)** Tenant com `status='expired'`/`canceled` e `billing_exempt=false` **não** consegue ler/escrever dados sensíveis via API direta (ex.: `supabase.from('payments').select/insert` falha) — o bypass do PRD-1 deixa de existir.
- [ ] **(C1)** Tenant com `billing_exempt=true` ou `active`/`trial` válido continua acessando normalmente (atuais não impactados).
- [ ] **(C1 anti-deadlock)** Tenant bloqueado (`expired`/`past_due`) ainda abre `/assinatura` e `/conta` e conclui `subscribe`/`cancel` — não fica preso sem conseguir pagar.
- [ ] **(A1)** Após `PAYMENT_CONFIRMED`, `current_period_end` fica preenchido; o cron `expire-subscriptions` consegue mover `active` vencido → `past_due`.

## 8. Verificação (manual, sandbox)

1. Configurar env sandbox + URL do webhook (ex.: túnel para localhost ou deploy de preview).
2. Pela `/assinatura`, assinar com **cartão de teste** da Asaas.
3. Conferir no painel Asaas a assinatura e no banco os ids + `status='active'`.
4. Usar o reenvio de webhook da Asaas para validar idempotência.
5. Simular `OVERDUE`/cancelamento e conferir bloqueio.
6. **(C1)** Com uma conta de teste `status='expired'`, `billing_exempt=false`: no console autenticado, tentar `supabase.from('payments').select('*')` e `insert(...)` → devem **falhar** após o enforcement. Repetir com conta isenta/ativa → deve passar.
7. **(A1)** Após pagamento confirmado, conferir `current_period_end` no banco; forçar a data no passado e rodar o cron → `status` vira `past_due`.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| **PCI / cartão** | Hosted checkout ou tokenização; nunca persistir PAN/CVV; revisão de logs |
| **Idempotência** | `subscription_events.asaas_event_id` unique é load-bearing; sempre 2xx em duplicado |
| **Escrita service-role bypassa RLS** | Resolver `tenant_id` só pelo mapeamento armazenado/sessão; service key server-only |
| **Re-tentativas da Asaas** | Responder 2xx ao registrar o evento; 5xx só quando reprocessar é seguro |
| **Divergência sandbox/prod** | Env e chaves separadas; checklist de cutover; testar lifecycle completo em sandbox antes do prod |
| **Falha parcial no `subscribe`** (cria na Asaas mas falha ao persistir) | Reconciliar por `externalReference=tenantId`; `getOrCreateCustomer` idempotente; log + retry |
| **(C1) Enforcement bloquear quem não devia** | Todas as contas atuais estão `billing_exempt=true` → ligar não bloqueia ninguém; aplicar função antes, validar, depois acoplar às policies; testar com conta não-isenta |
| **(C1) Custo por query da RLS** | `tenant_has_entitlement()` é `stable`/indexada por `tenant_id`; aplicar primeiro em escrita e leitura sensível; medir; cachear no claim só para UX, nunca para autorização |
| **(A1) `current_period_end` não vindo da Asaas** | Derivar do `nextDueDate`/ciclo retornado; se ausente, calcular `+1 mês` a partir do pagamento; logar anomalia |
| **(C1) Deadlock de pagamento** (bloqueado não consegue pagar) | Allowlist (`subscriptions`/`tenant_settings`/`user_claims`) + rotas de billing via service role; critério de aceite anti-deadlock |
| **(C1) Recursão de policy / função sem bypass** | `tenant_has_entitlement()` é `SECURITY DEFINER` com owner que ignora RLS de `subscriptions`; teste explícito de ausência de recursão |

## 10. Métricas de sucesso

- Taxa de sucesso de `subscribe` (criação de assinatura) ≥ meta definida.
- 100% dos eventos de pagamento refletidos em `subscriptions` em ≤ 1 ciclo de cron.
- 0 duplicações de efeito por reenvio de webhook.
- 0 incidentes de dado de cartão em logs/banco.

## 11. Dependências

- Conta Asaas (sandbox + produção), chave de API e token de webhook.
- PRD-1 em produção (tabelas, claim, guard).
- Decisão de produto: valor mensal do plano e CPF/CNPJ exigido no cadastro do customer.

# PRD-1 — Fundação de entitlement & paywall

> **Status:** proposto · **Sequência:** 1 de 3 · **Depende de:** — · **Habilita:** PRD-2, PRD-3
> Ver visão geral e decisões travadas no [README dos PRDs](README.md).

## 1. Contexto & objetivo

O Painel Fix v2 é hoje 100% gratuito. Este PRD estabelece a **fundação de entitlement** (direito de acesso) e o **paywall**, **sem ainda integrar cobrança**. Ao final, todo tenant nasce com um **trial de 14 dias** e, quando o entitlement não está ativo (`trial` expirado, ou — no futuro — `past_due`/`canceled`/`expired`), o app inteiro é bloqueado e redirecionado para uma tela de assinatura.

**Por que primeiro:** é entregável de forma independente, valida o mecanismo de bloqueio com risco baixo e prepara o terreno para a Asaas (PRD-2) sem depender dela.

**Resultado observável:** um tenant em trial usa o app normalmente; ao expirar o trial (ou via flip manual de status no banco para testes), o app bloqueia e só `/assinatura`, `/conta` e o fluxo de auth permanecem acessíveis.

## 2. Escopo

**In:**
- Tabelas `subscriptions` e `subscription_events` (+ RLS).
- Seed automático de trial na criação do tenant + backfill de tenants existentes.
- Auth hook `custom_access_token` que injeta o status da assinatura no JWT.
- Componente `<SubscriptionGuard>` montado no layout do grupo `(app)`.
- Exposição do status no `SessionContext`.
- Cron `expire-subscriptions` (backstop de transições por data).
- Página `/assinatura` **mínima** (placeholder/paywall): mostra status e mensagem; o formulário de pagamento real vem no PRD-3.

**Out (fica para PRD-2/PRD-3):**
- Qualquer chamada à API da Asaas, webhook, cobrança real.
- UI rica de billing, atualização de cartão, gestão self-service.
- Cobrança por professor/seat (apenas preparado no schema).

## 3. Requisitos funcionais

- **RF-1** — Ao criar um tenant (`bootstrap_tenant_and_admin`), criar **na mesma transação** uma linha em `subscriptions` com `status='trial'` e `trial_end = now() + interval '14 days'`.
- **RF-2** — Tenants já existentes (criados antes deste PRD) recebem uma linha de assinatura via **backfill**, para **não serem bloqueados** ao ligar o guard. Decisão travada: **um conjunto específico de contas** recebe `billing_exempt = true` (isenção vitalícia); as demais contas atuais recebem **trial de cortesia**. A lista de contas isentas (e-mails/`tenant_id`s) é parâmetro da migration — ver §5.2.
- **RF-2b** — **Isenção vitalícia** (`billing_exempt = true`): a conta tem entitlement permanente, **nunca expira**, e é **ignorada** por cron e webhooks (nunca rebaixada para `expired`/`past_due`). A flag é ortogonal ao `status` — uma conta isenta pode até assinar depois sem quebrar nada.
- **RF-3** — Todo usuário autenticado de um tenant pode **ler** a assinatura do próprio tenant (necessário para o guard). Nenhum cliente pode **escrever** (só service role).
- **RF-4** — O access token JWT carrega `app_metadata.subscription = { status, billing_exempt, trial_end, current_period_end }`.
- **RF-5** — O `<SubscriptionGuard>` calcula o entitlement: **ativo** se `billing_exempt = true`, ou `status='active'`, ou (`status='trial'` **e** `trial_end >= now()`). Caso contrário, **sem entitlement**.
- **RF-6** — Sem entitlement, o guard bloqueia o conteúdo do app e redireciona para `/assinatura`. **Allowlist** sempre acessível: `/assinatura`, `/conta` (auth e `/onboarding` já estão fora do grupo `(app)`).
- **RF-7** — A expiração de trial é avaliada **localmente por data** (não depende de webhook): mesmo com claim `trial` "fresco", se `trial_end < now()` o guard trata como expirado imediatamente. Contas com `billing_exempt = true` **nunca** caem no paywall.
- **RF-8** — O cron diário `expire-subscriptions` transiciona no banco apenas linhas **não isentas** (`billing_exempt = false`): `trial` com `trial_end < now()` → `expired`; `active` com `current_period_end < now()` → `past_due`.
- **RF-9** — O `SessionContext` expõe `subscriptionStatus` e dados derivados (ex.: `trialDaysLeft`) para a UI consumir.

## 4. Requisitos não-funcionais

- **RNF-1 (performance)** — A verificação de entitlement no hot path **não faz ida ao banco**: lê do claim JWT decodificado (`getClaims()`), com fallback ao fetch único já existente no `SessionContext`.
- **RNF-2 (segurança)** — Escrita em `subscriptions`/`subscription_events` apenas via service role; RLS de leitura por `tenant_id = current_tenant_id()`. Mantém a regra pétrea "nunca confiar em `tenant_id` do frontend".
- **RNF-3 (consistência)** — Trial criado atomicamente com o tenant: nunca existe tenant sem assinatura. `ON CONFLICT (tenant_id) DO NOTHING` garante idempotência.
- **RNF-4 (resiliência a staleness)** — Aceita-se defasagem de até ~1h (TTL do token) para transições orientadas a evento; coberta pelo cron diário e por `refreshSession()` em pontos relevantes (PRD-2/3).
- **RNF-5 (i18n)** — Textos em pt-BR.

## 5. Modelo de dados & arquitetura

### 5.1 Migration `db/migrations/20260620_create_subscriptions.sql`

```sql
create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null default current_tenant_id()
                          references public.tenants(id) on delete cascade,
  plan                  text not null default 'standard',
  status                text not null default 'trial',   -- trial|active|past_due|canceled|expired
  billing_exempt        boolean not null default false,   -- isenção vitalícia (cortesia/dono); ignora cobrança
  payment_method        text,                             -- 'credit_card'
  trial_end             timestamptz,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  asaas_customer_id     text,
  asaas_subscription_id text,
  -- futuro per-seat (nullable, ignorado na v1):
  seats                 integer,
  unit_price_cents      integer,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- UM registro por tenant POR ENQUANTO. Para evoluir a per-seat, dropar este unique.
create unique index subscriptions_tenant_unique on public.subscriptions(tenant_id);
create index subscriptions_asaas_sub_idx  on public.subscriptions(asaas_subscription_id);
create index subscriptions_asaas_cust_idx on public.subscriptions(asaas_customer_id);

create table public.subscription_events (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid references public.tenants(id) on delete cascade,
  asaas_event_id        text unique,        -- idempotência
  event_type            text not null,
  asaas_payment_id      text,
  asaas_subscription_id text,
  raw_payload           jsonb not null,
  processed_at          timestamptz not null default now()
);

alter table public.subscriptions       enable row level security;
alter table public.subscription_events  enable row level security;

create policy subscriptions_read on public.subscriptions
  for select using (tenant_id = current_tenant_id());
-- sem policy de insert/update/delete: escrita só via service role.
-- subscription_events: sem policy de leitura (service-role only).
```

### 5.2 Migration `db/migrations/20260620_bootstrap_seeds_trial.sql`

`CREATE OR REPLACE` de `bootstrap_tenant_and_admin` (base: [20251117_replace_bootstrap_tenant_and_admin.sql](../../db/migrations/20251117_replace_bootstrap_tenant_and_admin.sql)), inserindo a linha de trial logo após o `INSERT` em `user_claims`, dentro da mesma função `SECURITY DEFINER`:

```sql
insert into public.subscriptions (tenant_id, status, trial_end)
values (v_tenant_id, 'trial', now() + interval '14 days')
on conflict (tenant_id) do nothing;
```

**Backfill** (no mesmo arquivo ou separado), para tenants pré-existentes. Decisão travada: **um conjunto específico** de contas fica **isento vitalício** (`billing_exempt = true`); as demais contas atuais recebem **trial de cortesia**.

```sql
-- 1) Garante uma linha de assinatura para todo tenant existente (trial de cortesia).
insert into public.subscriptions (tenant_id, status, trial_end)
select t.id, 'trial', now() + interval '14 days'
from public.tenants t
left join public.subscriptions s on s.tenant_id = t.id
where s.id is null
on conflict (tenant_id) do nothing;

-- 2) Marca as contas escolhidas como isentas vitalícias.
--    Preencher a lista por e-mail do owner (via user_claims) OU por tenant_id direto.
--    >>> SUBSTITUIR pela lista real fornecida pelo dono da plataforma <<<
update public.subscriptions sub
set billing_exempt = true, status = 'active'
where sub.tenant_id in (
  select uc.tenant_id
  from public.user_claims uc
  where uc.role = 'owner'
    and lower(uc.user_email_snapshot) in (
      'EMAIL_DONO_1@exemplo.com'
      -- , 'EMAIL_DONO_2@exemplo.com'
    )
);
-- Alternativa por id: where sub.tenant_id in ('<tenant_id_1>', '<tenant_id_2>');
```
> ⚠️ **Pendência:** a lista exata de contas isentas (e-mails dos owners ou `tenant_id`s) precisa ser fornecida antes de aplicar a migration.

### 5.3 Auth hook `custom_access_token` (migration)

Função Postgres registrada como hook de access token que lê `subscriptions` do tenant do usuário e injeta:

```jsonc
"app_metadata": {
  "subscription": { "status": "trial", "billing_exempt": false, "trial_end": "...", "current_period_end": null }
}
```
Habilitar o hook no projeto Supabase (Auth Hooks). Lido no cliente via `getClaims()` em [supabaseClient.ts](../../src/lib/supabaseClient.ts).

### 5.4 Enforcement — `<SubscriptionGuard>`

Novo `src/components/SubscriptionGuard.jsx` (client), montado dentro do `SessionProvider` em [src/app/(app)/layout.jsx](../../src/app/(app)/layout.jsx):

```jsx
// layout.jsx (depois)
<SessionProvider>
  <SubscriptionGuard>
    <AppShell>…</AppShell>
  </SubscriptionGuard>
</SessionProvider>
```
Lógica: lê `subscriptionStatus`/`trial_end` do `useSession`; computa entitlement (RF-5/RF-7); se sem entitlement e rota fora da allowlist → renderiza paywall / `router.replace('/assinatura')`.

### 5.5 Cron `expire-subscriptions`

`src/app/api/cron/expire-subscriptions/route.ts`, espelhando o padrão de [dunning-reminders](../../src/app/api/cron/dunning-reminders/route.ts) (Bearer `CRON_SECRET`, `createClient` com `SUPABASE_SERVICE_ROLE_KEY`, varredura cross-tenant). Registrar em [vercel.json](../../vercel.json):

```json
{ "path": "/api/cron/expire-subscriptions", "schedule": "0 6 * * *" }
```

## 6. Arquivos a criar/alterar

**Criar:** `db/migrations/20260620_create_subscriptions.sql`, `db/migrations/20260620_bootstrap_seeds_trial.sql`, migration do auth hook, `src/components/SubscriptionGuard.jsx`, `src/app/(app)/assinatura/page.jsx` (mínima), `src/app/api/cron/expire-subscriptions/route.ts`.
**Alterar:** [src/app/(app)/layout.jsx](../../src/app/(app)/layout.jsx), [src/contexts/SessionContext.jsx](../../src/contexts/SessionContext.jsx), [vercel.json](../../vercel.json).

## 7. Critérios de aceite

- [ ] Criar um tenant novo gera automaticamente linha em `subscriptions` com `status='trial'` e `trial_end ≈ now()+14d`.
- [ ] Tenants pré-existentes têm linha após o backfill (nenhum fica sem assinatura).
- [ ] As contas da lista de isenção ficam com `billing_exempt = true` e **nunca** caem no paywall, mesmo com `trial_end`/`current_period_end` no passado.
- [ ] O cron `expire-subscriptions` **não** altera contas com `billing_exempt = true`.
- [ ] Usuário do tenant **lê** sua assinatura; tentativa de escrita pelo cliente é negada por RLS.
- [ ] JWT do usuário contém `app_metadata.subscription`.
- [ ] Com `status='trial'` válido, o app funciona normalmente.
- [ ] Forçando `trial_end` no passado (ou `status='expired'`), o app bloqueia e redireciona para `/assinatura`; `/assinatura` e `/conta` continuam acessíveis.
- [ ] Cron `expire-subscriptions` transiciona `trial` vencido → `expired` (testável via chamada manual com `CRON_SECRET`).
- [ ] `npm test` continua verde (gateways existentes intactos).

## 8. Verificação (manual)

1. Aplicar migrations no Supabase; rodar o app.
2. Criar conta nova → confiar onboarding → conferir linha `subscriptions` (trial).
3. No SQL editor, setar `trial_end = now() - interval '1 day'` para o tenant → recarregar app → deve cair no paywall. Repetir com `billing_exempt = true` → **não** deve bloquear.
4. Navegar para `/conta` e `/assinatura` → devem abrir.
5. `curl` no cron com header `Authorization: Bearer $CRON_SECRET` → conferir flip para `expired`.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| **Backfill esquecido** → todos os tenants bloqueados ao subir o guard | Backfill obrigatório na mesma entrega; checar contagem `tenants` vs `subscriptions` antes de habilitar o guard |
| **Staleness do JWT** (status muda no banco, claim demora ~1h) | Data local para trial + cron diário; eventos de pagamento só no PRD-2 |
| **Guard client burlável** (JS off) | Aceito na v1: RLS protege os *dados*; guard controla só *acesso à UI*. Promover a layout server-side se preciso |
| **Auth hook mal configurado** → claim ausente | Fallback do guard ao fetch do `SessionContext`; testar token logo após login |

## 10. Métricas de sucesso

- 100% dos tenants (novos e existentes) com linha em `subscriptions`.
- 0 acessos ao app com entitlement inválido (auditável por logs do guard/cron).
- Overhead de navegação desprezível (sem query de billing por request).

-- PRD-1 — Fundação de entitlement & paywall
-- Cria as tabelas de assinatura do SaaS (cobrança PELA plataforma, distinta das
-- mensalidades dos alunos em `payments`). Multi-tenant, RLS habilitado.
--
-- Convenções do projeto:
--   - `tenant_id` nunca vem do frontend; default = current_tenant_id().
--   - Toda ESCRITA vem do service role (webhook/cron/rotas server) → bypassa RLS.
--   - Leitura por membros do tenant (necessária para o paywall guard).
--
-- Idempotente o suficiente para reaplicar em dev (IF NOT EXISTS / DROP POLICY).

-- ──────────────────────────────────────────────────────────────────────────
-- subscriptions: UM registro por tenant POR ENQUANTO (unique tenant_id).
-- Para evoluir a cobrança por-professor (seat): dropar o unique e passar a
-- popular `seats`/`unit_price_cents` — sem renomear colunas nem reescrever
-- consumidores.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null default current_tenant_id()
                          references public.tenants(id) on delete cascade,
  plan                  text not null default 'standard',
  status                text not null default 'trial',   -- trial|active|past_due|canceled|expired
  billing_exempt        boolean not null default false,   -- isenção vitalícia (cortesia/dono): ignora cobrança
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

-- status válidos (defensivo; facilita evolução controlada)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_status_chk'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_status_chk
      check (status in ('trial','active','past_due','canceled','expired'));
  end if;
end $$;

create unique index if not exists subscriptions_tenant_unique   on public.subscriptions(tenant_id);
create index        if not exists subscriptions_asaas_sub_idx   on public.subscriptions(asaas_subscription_id);
create index        if not exists subscriptions_asaas_cust_idx  on public.subscriptions(asaas_customer_id);

-- mantém updated_at coerente em qualquer UPDATE
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ──────────────────────────────────────────────────────────────────────────
-- subscription_events: log de webhooks/ações p/ idempotência + auditoria.
-- `asaas_event_id` UNIQUE é load-bearing (processa-uma-vez no webhook).
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.subscription_events (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid references public.tenants(id) on delete cascade,
  asaas_event_id        text unique,        -- idempotência
  event_type            text not null,
  asaas_payment_id      text,
  asaas_subscription_id text,
  raw_payload           jsonb not null,
  processed_at          timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────────
-- RLS
-- ──────────────────────────────────────────────────────────────────────────
alter table public.subscriptions       enable row level security;
alter table public.subscription_events enable row level security;

-- Leitura: qualquer membro autenticado do tenant lê a assinatura do próprio
-- tenant (o paywall guard precisa disso para todo usuário).
drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions
  for select
  using (tenant_id = current_tenant_id());

-- Sem policy de INSERT/UPDATE/DELETE: escrita só via service role (que bypassa
-- RLS). subscription_events não tem policy alguma → service-role only.

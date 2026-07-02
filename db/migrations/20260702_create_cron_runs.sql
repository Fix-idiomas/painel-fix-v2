-- Log durável de execuções de cron.
--
-- Motivação: a retenção de logs do Vercel é curta (consultar >24h retorna
-- ExceedsBillingLimitError), então "o job rodou?" ficava sem resposta auditável.
-- Esta tabela registra CADA execução (início, fim, status e resumo por tenant),
-- transformando essa pergunta numa consulta trivial e permanente.
--
-- Convenções do projeto:
--   - Escrita SÓ via service role (as rotas /api/cron/* rodam server-to-server
--     com a service key → bypassam RLS).
--   - NÃO é multi-tenant: registra a execução GLOBAL do cron (que varre todos os
--     tenants). Por isso NÃO há policy de leitura por tenant — expor o resumo a
--     um admin de tenant vazaria dados de outras escolas. Leitura via
--     SQL/dashboard (service role). Mesma estratégia de `subscription_events`.
--
-- Idempotente para reaplicar (IF NOT EXISTS / DROP POLICY).

create table if not exists public.cron_runs (
  id           uuid primary key default gen_random_uuid(),
  job          text not null,               -- ex.: 'monthly-previa'
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  ok           boolean,                      -- true=ok | false=erro | null=em andamento
  status       text,                         -- 'ok' | 'partial' | 'error'
  summary      jsonb,                        -- totais + resultado por tenant
  error        text,
  created_at   timestamptz not null default now()
);

-- "última execução do job X" e varreduras por período ficam rápidas.
create index if not exists cron_runs_job_started_idx
  on public.cron_runs(job, started_at desc);

alter table public.cron_runs enable row level security;
-- Sem policy alguma → apenas service role acessa (igual subscription_events).

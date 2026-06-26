-- TD-1 — Idempotência de reassinatura concorrente (ver docs/TECH_DEBT.md).
--
-- Contexto: subscriptions tem 1 linha por tenant (subscriptions_tenant_unique).
-- O duplicado problemático NÃO são 2 linhas aqui, mas 2 assinaturas na Asaas
-- (uma órfã) quando 2 requests concorrentes de reassinatura (duplo-clique entre
-- abas/dispositivos) criam ambas antes de qualquer um persistir o id.
--
-- Solução: "claim" atômico via UPDATE condicional. O Postgres trava a linha
-- (row lock + re-checagem do WHERE via EvalPlanQual) → só 1 request vence; o
-- outro vê 0 linhas → 409. A janela de validade é calculada AQUI no servidor
-- (now() - interval), evitando passar timestamp pela query string do PostgREST.

alter table public.subscriptions
  add column if not exists checkout_claim_at timestamptz;

comment on column public.subscriptions.checkout_claim_at is
  'TD-1: timestamp do checkout em andamento (idempotência de reassinatura). NULL = nenhum em andamento; preenchido por claim_checkout() e zerado ao concluir/falhar.';

-- Claim atômico: marca a intenção de checkout e devolve true se ESTE request
-- venceu a corrida. Reivindica apenas se não há assinatura ativa e não há claim
-- recente (janela de 90s — expira sozinha se a tentativa falhar no meio).
-- security definer + service_role: a rota subscribe já gateia owner/admin antes.
create or replace function public.claim_checkout(p_tenant uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.subscriptions
     set checkout_claim_at = now()
   where tenant_id = p_tenant
     and status <> 'active'
     and (checkout_claim_at is null
          or checkout_claim_at < now() - interval '90 seconds');
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke execute on function public.claim_checkout(uuid) from anon, authenticated, public;
grant  execute on function public.claim_checkout(uuid) to service_role;

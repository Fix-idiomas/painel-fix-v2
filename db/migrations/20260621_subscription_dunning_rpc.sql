-- PRD-2 (RF-14) — alvos do dunning de assinatura.
-- Retorna tenants em atraso (past_due, não isentos) com e-mail do owner e marca.
-- Junta auth.users (não acessível via PostgREST), por isso é SECURITY DEFINER.
-- Server-only: executável apenas por service_role (o cron usa service role).

create or replace function public.subscription_dunning_targets()
returns table(tenant_id uuid, brand_name text, owner_email text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select s.tenant_id,
         ts.brand_name,
         coalesce(u.email, uc.user_email_snapshot) as owner_email
  from public.subscriptions s
  join public.user_claims uc
    on uc.tenant_id = s.tenant_id and uc.role = 'owner'
  left join public.tenant_settings ts on ts.tenant_id = s.tenant_id
  left join auth.users u on u.id = uc.user_id
  where s.status = 'past_due'
    and s.billing_exempt = false;
$$;

revoke all on function public.subscription_dunning_targets() from anon, authenticated, public;
grant execute on function public.subscription_dunning_targets() to service_role;

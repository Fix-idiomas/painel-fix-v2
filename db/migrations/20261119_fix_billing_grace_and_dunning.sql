-- Auditoria C3 — cobrança: carência correta + dunning que de fato encontra o dono.
--
-- 1) tenant_access_level(): a carência somente-leitura (7 dias) usava
--      coalesce(trial_end, current_period_end)
--    Todo tenant nasce com trial_end e ninguém o limpa ao assinar → para um
--    PAGANTE em atraso a referência virava a data antiga do trial e ele caía
--    direto em 'blocked', sem os 7 dias de leitura. Agora a referência depende do
--    status: trial → trial_end; demais → current_period_end (fallback trial_end).
--    Espelhado em src/lib/entitlement.js (accessLevel).
--
-- 2) subscription_dunning_targets(): buscava o dono por user_claims.role='owner',
--    mas o check constraint só aceita 'admin'|'user' → NUNCA retornava ninguém e o
--    e-mail de assinatura em atraso nunca saía. O dono é tenants.owner_user_id
--    (titularidade de primeira classe — ver 20260706_owner_first_class.sql).
--    Passa a devolver também current_period_end, para o cron espaçar os avisos.
--
-- Idempotente.

-- ── 1) Carência ─────────────────────────────────────────────────────────────
create or replace function public.tenant_access_level()
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with s as (select * from public.subscriptions where tenant_id = current_tenant_id() limit 1)
  select case
    when not exists (select 1 from s) then 'blocked'
    when (select billing_exempt from s) then 'full'
    when (select status from s) = 'active' then 'full'
    when (select status from s) = 'trial'
         and ((select trial_end from s) is null or (select trial_end from s) >= now()) then 'full'
    -- carência somente-leitura: até 7 dias após o fim do que estava valendo
    when (case when (select status from s) = 'trial'
               then (select trial_end from s)
               else coalesce((select current_period_end from s), (select trial_end from s))
          end) >= now() - interval '7 days' then 'readonly'
    else 'blocked'
  end;
$function$;

-- ── 2) Alvos do dunning ─────────────────────────────────────────────────────
-- O tipo de retorno muda (coluna nova) → precisa de DROP antes do CREATE.
drop function if exists public.subscription_dunning_targets();

create function public.subscription_dunning_targets()
returns table(tenant_id uuid, brand_name text, owner_email text, current_period_end timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select s.tenant_id,
         ts.brand_name,
         u.email as owner_email,
         s.current_period_end
  from public.subscriptions s
  join public.tenants t on t.id = s.tenant_id
  left join auth.users u on u.id = t.owner_user_id
  left join public.tenant_settings ts on ts.tenant_id = s.tenant_id
  where s.status = 'past_due'
    and s.billing_exempt = false;
$$;

revoke all on function public.subscription_dunning_targets() from anon, authenticated, public;
grant execute on function public.subscription_dunning_targets() to service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Reaplicar as definições de 20260621_entitlement_enforcement.sql (tenant_access_level)
-- e 20260621_subscription_dunning_rpc.sql (subscription_dunning_targets; exige
-- DROP antes, pelo tipo de retorno).

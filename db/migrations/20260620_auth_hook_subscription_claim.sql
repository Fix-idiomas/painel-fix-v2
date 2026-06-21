-- PRD-1 — Fundação de entitlement & paywall
-- Auth hook (custom access token): injeta o status da assinatura no access token
-- como o claim de topo "subscription", para o paywall guard avaliar entitlement
-- SEM ida ao banco (lido no cliente via getClaims() em src/lib/supabaseClient.ts).
--
-- Padrão oficial Supabase (Auth Hooks): a função roda como `supabase_auth_admin`.
-- Diferença importante vs. o exemplo da doc: NÃO revogamos o acesso de
-- `authenticated` em subscriptions/user_claims — os próprios usuários precisam
-- ler essas tabelas (RLS já cobre o isolamento por tenant). Apenas concedemos
-- leitura ao auth admin + policy permissiva para ele.
--
-- PASSO MANUAL: após aplicar, habilitar em Authentication > Hooks (Beta) →
-- "Custom Access Token" apontando para public.custom_access_token_hook.
--
-- Pré-requisito: 20260620_create_subscriptions.sql aplicado.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims       jsonb;
  v_user_id    uuid := (event->>'user_id')::uuid;
  v_status     text;
  v_exempt     boolean;
  v_trial_end  timestamptz;
  v_period_end timestamptz;
begin
  claims := event->'claims';

  -- Tenant "atual" = claim mais recente do usuário (mesma regra do bootstrap).
  select s.status, s.billing_exempt, s.trial_end, s.current_period_end
    into v_status, v_exempt, v_trial_end, v_period_end
  from public.user_claims uc
  join public.subscriptions s on s.tenant_id = uc.tenant_id
  where uc.user_id = v_user_id
  order by uc.created_at desc nulls last
  limit 1;

  if v_status is not null then
    claims := jsonb_set(claims, '{subscription}', jsonb_build_object(
      'status',             v_status,
      'billing_exempt',     coalesce(v_exempt, false),
      'trial_end',          v_trial_end,
      'current_period_end', v_period_end
    ));
  else
    -- Usuário sem tenant/assinatura (ex.: pré-onboarding) → claim nulo.
    claims := jsonb_set(claims, '{subscription}', 'null'::jsonb);
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- ── Grants exigidos pelo mecanismo de hooks ────────────────────────────────
grant usage on schema public to supabase_auth_admin;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- O hook precisa LER as duas tabelas envolvidas no mapeamento user → tenant → sub.
grant select on public.subscriptions to supabase_auth_admin;
grant select on public.user_claims   to supabase_auth_admin;

-- Como ambas têm RLS, o auth admin precisa de policy permissiva de leitura.
-- (Aditivo: não remove nem afeta as policies existentes dos usuários.)
drop policy if exists subscriptions_auth_admin_read on public.subscriptions;
create policy subscriptions_auth_admin_read on public.subscriptions
  as permissive for select to supabase_auth_admin using (true);

drop policy if exists user_claims_auth_admin_read on public.user_claims;
create policy user_claims_auth_admin_read on public.user_claims
  as permissive for select to supabase_auth_admin using (true);

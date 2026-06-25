-- PRD-2 (C1) — Enforcement de entitlement no banco (tri-estado).
-- Move o paywall da UI para uma fronteira de dados real: tenant sem entitlement
-- não lê/escreve dados de negócio, mesmo batendo direto na API/PostgREST.
--
-- Estratégia: policies RESTRICTIVE (AND com as policies permissivas existentes),
-- então NÃO é preciso reescrever nenhuma policy atual. O service role bypassa
-- RLS, então webhook/cron/rotas server continuam funcionando.
--
-- ROLLOUT SEGURO: todas as contas atuais estão billing_exempt=true → as funções
-- retornam acesso 'full' → ligar isto é NO-OP para todos hoje (validado por
-- contagem de "tenants que seriam bloqueados" = 0 antes de aplicar).
-- KILL-SWITCH/ROLLBACK: o bloco final (comentado) dropa todas as policies _ent_*.

-- ── Funções de entitlement (tri-estado) ────────────────────────────────────
-- full | readonly (carência de N dias) | blocked
create or replace function public.tenant_access_level()
returns text language sql stable security definer set search_path = public
as $$
  with s as (
    select * from public.subscriptions where tenant_id = current_tenant_id() limit 1
  )
  select case
    when not exists (select 1 from s)                              then 'blocked'
    when (select billing_exempt from s)                           then 'full'
    when (select status from s) = 'active'                        then 'full'
    when (select status from s) = 'trial'
         and ((select trial_end from s) is null
              or (select trial_end from s) >= now())              then 'full'
    -- carência somente-leitura: até N dias após o vencimento (trial_end/period)
    when coalesce((select trial_end from s),
                  (select current_period_end from s))
         >= now() - interval '7 days'                             then 'readonly'
    else 'blocked'
  end;
$$;

create or replace function public.tenant_can_read() returns boolean
  language sql stable security definer set search_path = public
  as $$ select public.tenant_access_level() in ('full','readonly') $$;

create or replace function public.tenant_can_write() returns boolean
  language sql stable security definer set search_path = public
  as $$ select public.tenant_access_level() = 'full' $$;

grant execute on function public.tenant_access_level() to authenticated;
grant execute on function public.tenant_can_read()     to authenticated;
grant execute on function public.tenant_can_write()    to authenticated;

-- ── Policies RESTRICTIVE por tabela de negócio ──────────────────────────────
-- Leitura exige can_read (full|readonly); escrita exige can_write (só full).
-- Allowlist (NÃO entram, p/ o bloqueado conseguir se regularizar/operar a conta):
--   subscriptions, subscription_events, tenant_settings, user_claims, user_tenant,
--   tenants, plans, join_requests, admin_audit_logs, audit_log.
do $$
declare
  t text;
  tabelas text[] := array[
    'attendance','expense_categories','expense_entries','expense_templates',
    'finance_reminders_log','invoices','other_revenue_templates','other_revenues',
    'payers','payments','sessions','student_ai_insights','students','teachers',
    'turma_members','turmas'
  ];
begin
  foreach t in array tabelas loop
    execute format('drop policy if exists %I on public.%I', t||'_ent_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_ent_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_ent_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_ent_delete', t);

    execute format($f$create policy %I on public.%I as restrictive for select to authenticated using ((select public.tenant_can_read()))$f$, t||'_ent_select', t);
    execute format($f$create policy %I on public.%I as restrictive for insert to authenticated with check ((select public.tenant_can_write()))$f$, t||'_ent_insert', t);
    execute format($f$create policy %I on public.%I as restrictive for update to authenticated using ((select public.tenant_can_write())) with check ((select public.tenant_can_write()))$f$, t||'_ent_update', t);
    execute format($f$create policy %I on public.%I as restrictive for delete to authenticated using ((select public.tenant_can_write()))$f$, t||'_ent_delete', t);
  end loop;
end $$;

-- ── ROLLBACK (kill-switch) — descomente e rode para remover o enforcement ───
-- do $$
-- declare t text;
--   tabelas text[] := array['attendance','expense_categories','expense_entries',
--     'expense_templates','finance_reminders_log','invoices','other_revenue_templates',
--     'other_revenues','payers','payments','sessions','student_ai_insights','students',
--     'teachers','turma_members','turmas'];
-- begin
--   foreach t in array tabelas loop
--     execute format('drop policy if exists %I on public.%I', t||'_ent_select', t);
--     execute format('drop policy if exists %I on public.%I', t||'_ent_insert', t);
--     execute format('drop policy if exists %I on public.%I', t||'_ent_update', t);
--     execute format('drop policy if exists %I on public.%I', t||'_ent_delete', t);
--   end loop;
-- end $$;

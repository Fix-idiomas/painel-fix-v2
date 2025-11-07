-- Migration: Hardening other revenues (templates + generation)
-- Date: 2025-11-06
-- Description:
--  - Add permission check to ensure_other_revenues_for_month
--  - Revoke EXECUTE from PUBLIC/anon on sensitive functions
--  - Grant EXECUTE to authenticated/service_role appropriately
--  - Create idempotent indexes (uniqueness & performance)
--  - Optional compatibility view exposing template_id alias
--  - Provide DOWN section to revert
--
-- Safe to run multiple times (guards via IF EXISTS / IF NOT EXISTS).

-- =============================================================
-- ==============================  UP  =========================
-- =============================================================
-- Wrap everything in a DO block only where conditional logic is needed.

-- 1. Revoke existing broad EXECUTE privileges (guarded by existence checks)

-- create_other_revenue_series
DO $$
BEGIN
  IF to_regprocedure('public.create_other_revenue_series(text, numeric, date, text, text, text, date, integer, text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.create_other_revenue_series(text, numeric, date, text, text, text, date, integer, text) FROM PUBLIC, anon;
  END IF;
END$$;

-- ensure_other_revenues_for_month
DO $$
BEGIN
  IF to_regprocedure('public.ensure_other_revenues_for_month(text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.ensure_other_revenues_for_month(text) FROM PUBLIC, anon;
  END IF;
END$$;

-- generate_other_revenues
DO $$
BEGIN
  IF to_regprocedure('public.generate_other_revenues(date)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.generate_other_revenues(date) FROM PUBLIC, anon;
  END IF;
END$$;

-- generate_other_revenues_from_templates
DO $$
BEGIN
  IF to_regprocedure('public.generate_other_revenues_from_templates()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.generate_other_revenues_from_templates() FROM PUBLIC, anon;
  END IF;
END$$;

-- preview_generate_other_revenues
DO $$
BEGIN
  IF to_regprocedure('public.preview_generate_other_revenues(date)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.preview_generate_other_revenues(date) FROM PUBLIC, anon;
  END IF;
END$$;

-- rls_insert_other_revenue_admin (only service_role should keep)
DO $$
BEGIN
  IF to_regprocedure('public.rls_insert_other_revenue_admin(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_insert_other_revenue_admin(uuid) FROM PUBLIC, anon, authenticated;
  END IF;
END$$;

-- rls_read_other_revenues_snapshot
DO $$
BEGIN
  IF to_regprocedure('public.rls_read_other_revenues_snapshot(text, uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_read_other_revenues_snapshot(text, uuid) FROM PUBLIC, anon;
  END IF;
END$$;

-- 2. (Re)Define ensure_other_revenues_for_month with permission guard
CREATE OR REPLACE FUNCTION public.ensure_other_revenues_for_month(p_ym text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  t record;
  v_tenant uuid := current_tenant_id();
  v_month  date := to_date(p_ym || '-01', 'YYYY-MM-DD');
  v_due    date;
  v_created int := 0;
  v_kind text;
  v_idx int;
  v_total int;
  v_months_between int;
  v_years_between int;
begin
  -- Added permission check (write role required)
  IF NOT is_admin_or_finance_write(v_tenant) THEN
    RAISE EXCEPTION 'access denied' USING errcode='42501';
  END IF;

  for t in
    select *
      from public.other_revenue_templates
     where tenant_id = v_tenant
       and active
       and (
            (frequency = 'monthly')
         or (frequency = 'yearly'
             and extract(month from v_month) = coalesce(due_month, extract(month from v_month)))
       )
       and (start_month is null or start_month <= v_month)
       and (end_month   is null or end_month   >= v_month)
  loop
    -- Due date
    if t.frequency = 'yearly' then
      v_due := make_date(extract(year from v_month)::int,
                         coalesce(t.due_month, extract(month from v_month))::int,
                         t.due_day);
    else
      v_due := make_date(extract(year from v_month)::int,
                         extract(month from v_month)::int,
                         t.due_day);
    end if;

    v_kind  := coalesce(t.recurrence_type, 'indefinite');
    v_total := case when v_kind = 'installments' then nullif(t.total_installments, 0) else null end;

    v_idx := null;
    if v_kind = 'installments' and v_total is not null then
      if t.start_month is not null then
        v_months_between := (extract(year from v_month) - extract(year from t.start_month))::int * 12
                          + (extract(month from v_month) - extract(month from t.start_month))::int;
        if t.frequency = 'yearly' then
          v_years_between := (extract(year from v_month) - extract(year from t.start_month))::int;
          v_idx := v_years_between + 1;
        else
          v_idx := v_months_between + 1;
        end if;
        if v_idx < 1 or v_idx > v_total then
          continue;
        end if;
      else
        v_idx := 1;
      end if;
    end if;

    if v_idx is not null then
      begin
        insert into public.other_revenues
          (tenant_id, title, category, amount, competence_month, due_date,
           status, paid_at, canceled_at, cancel_note, cost_center, created_at,
           generated_from, installment_index, installments_total,
           recurrence_kind, recurrence_until)
        values
          (v_tenant, t.title, null, t.amount, date_trunc('month', v_due)::date, v_due,
           'pending', null, null, null, coalesce(t.cost_center, 'extra'), now(),
           t.id, v_idx, v_total,
           v_kind, t.end_month)
        on conflict on constraint uniq_other_rev_gen_install do nothing;
        if found then v_created := v_created + 1; end if;
      exception when undefined_object then
        if not exists (
          select 1 from public.other_revenues r
           where r.tenant_id = v_tenant
             and r.generated_from = t.id
             and r.installment_index = v_idx
        ) then
          insert into public.other_revenues
            (tenant_id, title, category, amount, competence_month, due_date,
             status, paid_at, canceled_at, cancel_note, cost_center, created_at,
             generated_from, installment_index, installments_total,
             recurrence_kind, recurrence_until)
          values
            (v_tenant, t.title, null, t.amount, date_trunc('month', v_due)::date, v_due,
             'pending', null, null, null, coalesce(t.cost_center, 'extra'), now(),
             t.id, v_idx, v_total,
             v_kind, t.end_month);
          v_created := v_created + 1;
        end if;
      end;
    else
      if not exists (
        select 1 from public.other_revenues r
         where r.tenant_id = v_tenant
           and r.due_date  = v_due
           and r.title     = t.title
      ) then
        insert into public.other_revenues
          (tenant_id, title, category, amount, competence_month, due_date,
           status, paid_at, canceled_at, cancel_note, cost_center, created_at,
           generated_from, recurrence_kind, recurrence_until)
        values
          (v_tenant, t.title, null, t.amount, date_trunc('month', v_due)::date, v_due,
           'pending', null, null, null, coalesce(t.cost_center, 'extra'), now(),
           t.id, v_kind, t.end_month);
        v_created := v_created + 1;
      end if;
    end if;
  end loop;

  return json_build_object('created', v_created);
end
$function$;

-- 3. Grants (tightened)
GRANT EXECUTE ON FUNCTION public.ensure_other_revenues_for_month(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_other_revenue_series(
  text, numeric, date, text, text, text, date, integer, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_other_revenues(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_other_revenues_from_templates() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_generate_other_revenues(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_read_other_revenues_snapshot(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_insert_other_revenue_admin(uuid) TO service_role; -- restricted

-- 4. Add missing columns (idempotent) if app expects them
ALTER TABLE public.other_revenues
  ADD COLUMN IF NOT EXISTS generated_from uuid,
  ADD COLUMN IF NOT EXISTS installment_index integer,
  ADD COLUMN IF NOT EXISTS installments_total integer,
  ADD COLUMN IF NOT EXISTS recurrence_kind text,
  ADD COLUMN IF NOT EXISTS recurrence_until date;

-- 5. Indexes (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_other_rev_gen_install
  ON public.other_revenues(tenant_id, generated_from, installment_index)
  WHERE generated_from IS NOT NULL AND installment_index IS NOT NULL;

CREATE INDEX IF NOT EXISTS other_rev_tenant_competence_idx
  ON public.other_revenues(tenant_id, competence_month);

CREATE INDEX IF NOT EXISTS other_rev_tenant_due_date_idx
  ON public.other_revenues(tenant_id, due_date);

CREATE INDEX IF NOT EXISTS other_rev_tpl_active_idx
  ON public.other_revenue_templates(tenant_id, active, start_month);

-- 6. Compatibility view (template_id alias)
CREATE OR REPLACE VIEW public.other_revenues_v AS
SELECT r.*, r.generated_from AS template_id
FROM public.other_revenues r;

-- 7. (Optional) Grant select on the view (RLS of base table still applies if simple view)
GRANT SELECT ON public.other_revenues_v TO authenticated;

-- =============================================================
-- ============================  DOWN  =========================
-- =============================================================
-- Revert changes (best-effort). Some data-dependent effects (inserted rows) are not undone.

-- 1. Drop view
DROP VIEW IF EXISTS public.other_revenues_v;

-- 2. Drop indexes created (KEEP the uniqueness if already relied upon? Here we drop.)
DROP INDEX IF EXISTS uniq_other_rev_gen_install;
DROP INDEX IF EXISTS other_rev_tenant_competence_idx;
DROP INDEX IF EXISTS other_rev_tenant_due_date_idx;
DROP INDEX IF EXISTS other_rev_tpl_active_idx;

-- 3. Restore original function without permission check
CREATE OR REPLACE FUNCTION public.ensure_other_revenues_for_month(p_ym text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  t record;
  v_tenant uuid := current_tenant_id();
  v_month  date := to_date(p_ym || '-01', 'YYYY-MM-DD');
  v_due    date;
  v_created int := 0;
  v_kind text;
  v_idx int;
  v_total int;
  v_months_between int;
  v_years_between int;
begin
  for t in
    select *
      from public.other_revenue_templates
     where tenant_id = v_tenant
       and active
       and (
            (frequency = 'monthly')
         or (frequency = 'yearly'
             and extract(month from v_month) = coalesce(due_month, extract(month from v_month)))
       )
       and (start_month is null or start_month <= v_month)
       and (end_month   is null or end_month   >= v_month)
  loop
    if t.frequency = 'yearly' then
      v_due := make_date(extract(year from v_month)::int,
                         coalesce(t.due_month, extract(month from v_month))::int,
                         t.due_day);
    else
      v_due := make_date(extract(year from v_month)::int,
                         extract(month from v_month)::int,
                         t.due_day);
    end if;

    v_kind  := coalesce(t.recurrence_type, 'indefinite');
    v_total := case when v_kind = 'installments' then nullif(t.total_installments, 0) else null end;

    v_idx := null;
    if v_kind = 'installments' and v_total is not null then
      if t.start_month is not null then
        v_months_between := (extract(year from v_month) - extract(year from t.start_month))::int * 12
                          + (extract(month from v_month) - extract(month from t.start_month))::int;
        if t.frequency = 'yearly' then
          v_years_between := (extract(year from v_month) - extract(year from t.start_month))::int;
          v_idx := v_years_between + 1;
        else
          v_idx := v_months_between + 1;
        end if;
        if v_idx < 1 or v_idx > v_total then
          continue;
        end if;
      else
        v_idx := 1;
      end if;
    end if;

    if v_idx is not null then
      begin
        insert into public.other_revenues
          (tenant_id, title, category, amount, competence_month, due_date,
           status, paid_at, canceled_at, cancel_note, cost_center, created_at,
           generated_from, installment_index, installments_total,
           recurrence_kind, recurrence_until)
        values
          (v_tenant, t.title, null, t.amount, date_trunc('month', v_due)::date, v_due,
           'pending', null, null, null, coalesce(t.cost_center, 'extra'), now(),
           t.id, v_idx, v_total,
           v_kind, t.end_month)
        on conflict on constraint uniq_other_rev_gen_install do nothing;
        if found then v_created := v_created + 1; end if;
      exception when undefined_object then
        if not exists (
          select 1 from public.other_revenues r
           where r.tenant_id = v_tenant
             and r.generated_from = t.id
             and r.installment_index = v_idx
        ) then
          insert into public.other_revenues
            (tenant_id, title, category, amount, competence_month, due_date,
             status, paid_at, canceled_at, cancel_note, cost_center, created_at,
             generated_from, installment_index, installments_total,
             recurrence_kind, recurrence_until)
          values
            (v_tenant, t.title, null, t.amount, date_trunc('month', v_due)::date, v_due,
             'pending', null, null, null, coalesce(t.cost_center, 'extra'), now(),
             t.id, v_idx, v_total,
             v_kind, t.end_month);
          v_created := v_created + 1;
        end if;
      end;
    else
      if not exists (
        select 1 from public.other_revenues r
         where r.tenant_id = v_tenant
           and r.due_date  = v_due
           and r.title     = t.title
      ) then
        insert into public.other_revenues
          (tenant_id, title, category, amount, competence_month, due_date,
           status, paid_at, canceled_at, cancel_note, cost_center, created_at,
           generated_from, recurrence_kind, recurrence_until)
        values
          (v_tenant, t.title, null, t.amount, date_trunc('month', v_due)::date, v_due,
           'pending', null, null, null, coalesce(t.cost_center, 'extra'), now(),
           t.id, v_kind, t.end_month);
        v_created := v_created + 1;
      end if;
    end if;
  end loop;

  return json_build_object('created', v_created);
end
$function$;

-- 4. Restore broad grants (original state); adjust if you want a different rollback behavior
GRANT EXECUTE ON FUNCTION public.ensure_other_revenues_for_month(text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_other_revenue_series(
  text, numeric, date, text, text, text, date, integer, text
) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_other_revenues(date) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_other_revenues_from_templates() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_generate_other_revenues(date) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_read_other_revenues_snapshot(text, uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_insert_other_revenue_admin(uuid) TO PUBLIC, anon, authenticated, service_role;

-- (NOTE) Columns added in UP are intentionally kept; dropping them can risk data loss. Add drops here only if required.
-- Example (commented):
-- ALTER TABLE public.other_revenues DROP COLUMN IF EXISTS recurrence_until;

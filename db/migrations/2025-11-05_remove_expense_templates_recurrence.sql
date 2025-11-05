-- Rollback Migration: Remove recurrence fields from expense_templates (non-breaking to existing structures)
-- Date: 2025-11-05
-- Scope: DROP ONLY the columns and constraints added by 2025-11-05_add_expense_templates_recurrence.sql
-- Does not modify or drop existing RLS, RPC, triggers, views, FKs, or unrelated structures.
-- Apply manually in Supabase SQL Editor only if you need to undo the additive migration.

BEGIN;

-- 1) Drop CHECK constraints if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_templates_recurrence_shape_check'
  ) THEN
    ALTER TABLE public.expense_templates
      DROP CONSTRAINT expense_templates_recurrence_shape_check;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_templates_installments_check'
  ) THEN
    ALTER TABLE public.expense_templates
      DROP CONSTRAINT expense_templates_installments_check;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_templates_recurrence_mode_check'
  ) THEN
    ALTER TABLE public.expense_templates
      DROP CONSTRAINT expense_templates_recurrence_mode_check;
  END IF;
END $$;

-- 2) Optional: Archive data from the columns before dropping (uncomment if desired)
-- CREATE TABLE IF NOT EXISTS public._archive_expense_templates_recurrence AS
-- SELECT id, recurrence_mode, start_month, installments, end_month
-- FROM public.expense_templates
-- WHERE recurrence_mode IS DISTINCT FROM 'indefinite'
--    OR start_month IS NOT NULL
--    OR installments IS NOT NULL
--    OR end_month IS NOT NULL;

-- 3) Drop columns if present (reverse order is fine)
ALTER TABLE public.expense_templates
  DROP COLUMN IF EXISTS end_month,
  DROP COLUMN IF EXISTS installments,
  DROP COLUMN IF EXISTS start_month,
  DROP COLUMN IF EXISTS recurrence_mode;

COMMIT;

-- Migration: Add recurrence fields to expense_templates (non-breaking)
-- Date: 2025-11-05
-- Scope: ADD ONLY. Does not modify or drop existing RLS, RPC, triggers, views, FKs, constraints, or indexes.
-- Apply manually in Supabase SQL Editor or your migration pipeline after review.

BEGIN;

-- 1) Add columns (idempotent with IF NOT EXISTS)
ALTER TABLE public.expense_templates
  ADD COLUMN IF NOT EXISTS recurrence_mode text NOT NULL DEFAULT 'indefinite',
  ADD COLUMN IF NOT EXISTS start_month date NULL,
  ADD COLUMN IF NOT EXISTS installments integer NULL,
  ADD COLUMN IF NOT EXISTS end_month date NULL;

-- 2) Allow-list of recurrence_mode values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_templates_recurrence_mode_check'
  ) THEN
    ALTER TABLE public.expense_templates
      ADD CONSTRAINT expense_templates_recurrence_mode_check
      CHECK (recurrence_mode IN ('indefinite','installments','until_month'));
  END IF;
END $$;

-- 3) installments must be >= 1 when provided
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_templates_installments_check'
  ) THEN
    ALTER TABLE public.expense_templates
      ADD CONSTRAINT expense_templates_installments_check
      CHECK (installments IS NULL OR installments >= 1);
  END IF;
END $$;

-- 4) Shape consistency across recurrence modes (kept permissive for existing data defaults)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_templates_recurrence_shape_check'
  ) THEN
    ALTER TABLE public.expense_templates
      ADD CONSTRAINT expense_templates_recurrence_shape_check
      CHECK (
        (recurrence_mode = 'indefinite'  AND installments IS NULL AND end_month IS NULL)
        OR
        (recurrence_mode = 'installments' AND installments IS NOT NULL AND end_month IS NULL)
        OR
        (recurrence_mode = 'until_month' AND end_month IS NOT NULL AND installments IS NULL)
      );
  END IF;
END $$;

-- Note:
-- - We are not enforcing that start_month/end_month are the 1st day (YYYY-MM-01) at DB-level to avoid friction; UI/app will ensure it.
-- - No changes to RLS, RPC, triggers, views or existing FKs.

COMMIT;

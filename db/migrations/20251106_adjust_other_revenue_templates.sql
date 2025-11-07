-- Migration: Adjust other_revenue_templates schema for auto-generation
-- Date: 2025-11-06
-- Description:
--  - Ensure required columns exist on public.other_revenue_templates
--  - Add basic constraints and indexes (idempotent)
--  - Safe to run multiple times

-- =============================== UP ================================

-- 1) Columns expected by ensure_other_revenues_for_month
ALTER TABLE public.other_revenue_templates
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS amount numeric,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS cost_center text,
  ADD COLUMN IF NOT EXISTS due_day integer,
  ADD COLUMN IF NOT EXISTS frequency text,              -- 'monthly' | 'yearly'
  ADD COLUMN IF NOT EXISTS due_month integer,           -- 1..12 (for yearly)
  ADD COLUMN IF NOT EXISTS start_month date,
  ADD COLUMN IF NOT EXISTS end_month date,
  ADD COLUMN IF NOT EXISTS recurrence_type text,        -- 'indefinite' | 'installments'
  ADD COLUMN IF NOT EXISTS total_installments integer;  -- when recurrence_type = 'installments'

-- 1.1) Normalize older recurrence_type checks that may use different names/values
--      Drop legacy check constraints on recurrence_type so we can add a unified, broader one below.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM   pg_constraint
    WHERE  conrelid = 'public.other_revenue_templates'::regclass
      AND  contype = 'c'
      AND  conname ILIKE '%recurrence_type%'
      AND  conname <> 'chk_other_rev_tpl_recurrence_type_valid'
  LOOP
    EXECUTE format('ALTER TABLE public.other_revenue_templates DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END$$;

-- 2) Lightweight constraints (only if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_other_rev_tpl_due_day_1_28'
  ) THEN
    ALTER TABLE public.other_revenue_templates
      ADD CONSTRAINT chk_other_rev_tpl_due_day_1_28
      CHECK (due_day IS NULL OR (due_day >= 1 AND due_day <= 28));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_other_rev_tpl_due_month_1_12'
  ) THEN
    ALTER TABLE public.other_revenue_templates
      ADD CONSTRAINT chk_other_rev_tpl_due_month_1_12
      CHECK (due_month IS NULL OR (due_month >= 1 AND due_month <= 12));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_other_rev_tpl_frequency_valid'
  ) THEN
    ALTER TABLE public.other_revenue_templates
      ADD CONSTRAINT chk_other_rev_tpl_frequency_valid
      CHECK (frequency IN ('monthly','yearly'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_other_rev_tpl_recurrence_type_valid'
  ) THEN
    ALTER TABLE public.other_revenue_templates
      ADD CONSTRAINT chk_other_rev_tpl_recurrence_type_valid
      -- Accept both EN and PT-BR synonyms to be compatible across environments
      CHECK (
        recurrence_type IN (
          'indefinite',      -- EN
          'installments',    -- EN
          'until_month',     -- EN (optional future use)
          'indefinido',      -- PT-BR
          'parcelado',       -- PT-BR
          'ate_mes',         -- PT-BR without accent
          'até_mes'          -- PT-BR with accent
        )
      );
  END IF;
END$$;

-- 3) Indexes (idempotent). One already exists in another migration but keep IF NOT EXISTS here.
CREATE INDEX IF NOT EXISTS other_rev_tpl_active_idx
  ON public.other_revenue_templates(tenant_id, active, start_month);

-- ============================== DOWN ===============================
-- Best-effort rollback: keep columns (to avoid data loss). Drop constraints and index if needed.

DROP INDEX IF EXISTS other_rev_tpl_active_idx;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_other_rev_tpl_due_day_1_28') THEN
    ALTER TABLE public.other_revenue_templates DROP CONSTRAINT chk_other_rev_tpl_due_day_1_28;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_other_rev_tpl_due_month_1_12') THEN
    ALTER TABLE public.other_revenue_templates DROP CONSTRAINT chk_other_rev_tpl_due_month_1_12;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_other_rev_tpl_frequency_valid') THEN
    ALTER TABLE public.other_revenue_templates DROP CONSTRAINT chk_other_rev_tpl_frequency_valid;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_other_rev_tpl_recurrence_type_valid') THEN
    ALTER TABLE public.other_revenue_templates DROP CONSTRAINT chk_other_rev_tpl_recurrence_type_valid;
  END IF;
END$$;

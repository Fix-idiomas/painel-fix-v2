-- Migration: Adjust other_revenues.recurrence_kind constraint to be cross-locale
-- Date: 2025-11-06
-- Description:
--  - Ensure column exists
--  - Drop legacy recurrence_kind check constraints
--  - Add a broader, idempotent check that accepts EN and PT-BR variants

-- =============================== UP ================================

-- 1) Ensure the column exists (do not change defaults here)
ALTER TABLE public.other_revenues
  ADD COLUMN IF NOT EXISTS recurrence_kind text;

-- 1.1) If column is NOT NULL in legacy DBs, relax to allow NULLs before normalization
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'other_revenues'
       AND column_name  = 'recurrence_kind'
       AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.other_revenues ALTER COLUMN recurrence_kind DROP NOT NULL;
  END IF;
END$$;

-- 2) Drop legacy recurrence_kind constraints to avoid conflicts
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM   pg_constraint
    WHERE  conrelid = 'public.other_revenues'::regclass
      AND  contype = 'c'
      AND  conname ILIKE '%recurrence_kind%'
      AND  conname <> 'chk_other_rev_recurrence_kind_valid'
  LOOP
    EXECUTE format('ALTER TABLE public.other_revenues DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END$$;

-- 3) Add broader check (idempotent). Allow NULLs for backward compatibility.
--    Before adding the constraint, normalize existing rows to compliant values to avoid failures.
DO $$
BEGIN
  -- Normalize existing values (map unknowns to NULL now that column allows NULL)
  UPDATE public.other_revenues
     SET recurrence_kind = CASE
       WHEN recurrence_kind IN ('indefinite','indefinido') THEN 'indefinido'
       WHEN recurrence_kind IN ('installments','parcelado') THEN 'parcelado'
       WHEN recurrence_kind IN ('until_month','ate_mes','até_mes') THEN 'ate_mes'
       ELSE NULL
     END
   WHERE recurrence_kind IS NOT NULL
     AND recurrence_kind NOT IN (
       'indefinite','installments','until_month','indefinido','parcelado','ate_mes','até_mes'
     );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_other_rev_recurrence_kind_valid'
  ) THEN
    ALTER TABLE public.other_revenues
      ADD CONSTRAINT chk_other_rev_recurrence_kind_valid
      CHECK (
        recurrence_kind IS NULL OR
        recurrence_kind IN (
          'indefinite',      -- EN
          'installments',    -- EN
          'until_month',     -- EN (optional)
          'indefinido',      -- PT-BR
          'parcelado',       -- PT-BR
          'ate_mes',         -- PT-BR without accent
          'até_mes'          -- PT-BR with accent
        )
      ) NOT VALID;
  END IF;
END$$;

-- 4) Try to validate (best-effort). If some legacy rows still violate, keep NOT VALID but continue.
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.other_revenues VALIDATE CONSTRAINT chk_other_rev_recurrence_kind_valid;
  EXCEPTION WHEN others THEN
    -- keep constraint NOT VALID to avoid migration failure
    NULL;
  END;
END$$;

-- ============================== DOWN ===============================
-- Best-effort rollback: drop our added constraint only.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_other_rev_recurrence_kind_valid') THEN
    ALTER TABLE public.other_revenues DROP CONSTRAINT chk_other_rev_recurrence_kind_valid;
  END IF;
END$$;

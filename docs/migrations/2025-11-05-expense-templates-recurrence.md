# Migration: expense_templates recurrence (non-breaking)

Date: 2025-11-05
Applies to: public.expense_templates

Scope: ADD ONLY. Does not modify or drop existing RLS, RPC, triggers, views, FKs, constraints, or indexes.

## What it does

- Adds columns to support recurrence duration:
  - `recurrence_mode` text NOT NULL DEFAULT 'indefinite' (allowed: 'indefinite' | 'installments' | 'until_month')
  - `start_month` date NULL
  - `installments` integer NULL (>= 1)
  - `end_month` date NULL
- Adds non-intrusive CHECK constraints for allowed values and shape consistency.
- Leaves existing data valid via defaults.

## How to apply

1. Open Supabase SQL Editor for the target project/DB.
2. Copy the SQL from `db/migrations/2025-11-05_add_expense_templates_recurrence.sql`.
3. Review and run it. The script is idempotent and uses `IF NOT EXISTS`.
4. Verify:
   - Columns exist in `public.expense_templates`
   - RLS policies remain unchanged
   - No RPC/Triggers/Views/Indexes affected

## Rollback

As this is additive and non-breaking, rollback is typically unnecessary. If needed, you can manually drop the added columns and constraints by name after ensuring no data depends on them.

## App follow-up

- The app will start reading these fields when present and remain compatible with legacy data.
- Annual frequency comparison has been aligned to 'annual' in code (DB already enforces 'annual').

# Rollback: expense_templates recurrence

Date: 2025-11-05
Target: public.expense_templates

This script undoes the additive recurrence columns and constraints added by `2025-11-05_add_expense_templates_recurrence.sql`.

## Safety and scope

- Drops only the added CHECK constraints and columns.
- Does not modify RLS, RPC, triggers, views, FKs, or unrelated structures.
- Idempotent-style: skips objects that don't exist.

## Recommended sequence

1) App readiness
   - Ensure the running app does not hard-require these columns. Preferably deploy a version that ignores them or revert to main.
2) Optional data archive
   - Uncomment the archive section in the SQL if you want to preserve existing values into a `_archive_expense_templates_recurrence` table before dropping.
3) Execute rollback SQL
   - Run `db/migrations/2025-11-05_remove_expense_templates_recurrence.sql` in Supabase SQL Editor.
4) Verify
   - Confirm columns are gone from `public.expense_templates`.
   - Confirm RLS policies are unchanged.

## Rollback SQL location

- `db/migrations/2025-11-05_remove_expense_templates_recurrence.sql`

## Notes

- If you want to re-introduce the columns later, re-run the original additive migration.

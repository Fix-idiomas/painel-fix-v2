-- Migration: Add safe_delete_other_revenue RPC to support delete with fallback under policy
-- Date: 2025-11-06
-- Description:
--  - Creates SECURITY DEFINER function to delete an other_revenue row scoped to current tenant
--  - Tries hard delete; on FK violation falls back to soft delete (status=canceled)
--  - Guarded by auth (requires authenticated user and tenant match)

-- =============================== UP ================================

CREATE OR REPLACE FUNCTION public.safe_delete_other_revenue(p_id uuid, p_mode text DEFAULT 'auto')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_row record;
  v_deleted int := 0;
  v_mode text := lower(coalesce(p_mode, 'auto'));
BEGIN
  -- Require authenticated caller
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Scope to current tenant
  SELECT public.current_tenant_id() INTO v_tenant;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant not found in context';
  END IF;

  SELECT * INTO v_row
  FROM public.other_revenues r
  WHERE r.id = p_id AND r.tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    -- nothing to do; return true for idempotency
    RETURN true;
  END IF;

  IF v_mode = 'soft' THEN
    UPDATE public.other_revenues
       SET status = 'canceled', canceled_at = now(), cancel_note = coalesce(cancel_note, 'soft-delete via rpc'), paid_at = NULL
     WHERE id = v_row.id;
    RETURN true;
  END IF;

  -- Try hard delete first when auto/hard
  IF v_mode IN ('auto','hard') THEN
    BEGIN
      DELETE FROM public.other_revenues WHERE id = v_row.id;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      IF v_deleted > 0 THEN
        RETURN true;
      END IF;
    EXCEPTION WHEN foreign_key_violation THEN
      -- Fall back to soft delete
      UPDATE public.other_revenues
         SET status = 'canceled', canceled_at = now(), cancel_note = coalesce(cancel_note, 'soft-delete via rpc'), paid_at = NULL
       WHERE id = v_row.id;
      RETURN true;
    END;
  END IF;

  RETURN true;
END;
$$;

-- Restrict execution
REVOKE ALL ON FUNCTION public.safe_delete_other_revenue(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.safe_delete_other_revenue(uuid, text) TO authenticated;

-- ============================== DOWN ===============================
DROP FUNCTION IF EXISTS public.safe_delete_other_revenue(uuid, text);

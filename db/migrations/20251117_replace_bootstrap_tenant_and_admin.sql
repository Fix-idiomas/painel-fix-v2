-- Replace bootstrap_tenant_and_admin to ensure tenant + owner claim are created idempotently
-- Assumptions: tables public.tenants(id uuid pk, name text, created_at timestamptz default now())
--              and public.user_claims(tenant_id uuid, user_id uuid, role text, perms jsonb, created_at timestamptz default now())
-- If your schema adds NOT NULL columns without defaults, adjust the INSERT column list accordingly.

DO $$
BEGIN
  -- Drop and recreate with the correct signature (text, text)
  -- We use CREATE OR REPLACE to avoid dropping grants.
  CREATE OR REPLACE FUNCTION public.bootstrap_tenant_and_admin(p_tenant_name text, p_display_name text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  DECLARE
    v_user_id   uuid := auth.uid();
    v_tenant_id uuid;
    v_name      text := COALESCE(NULLIF(trim(p_tenant_name), ''), 'Nova escola');
  BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'bootstrap_tenant_and_admin: auth.uid() is null';
    END IF;

    -- If user already has a claim, return that tenant
    SELECT uc.tenant_id
      INTO v_tenant_id
      FROM public.user_claims uc
     WHERE uc.user_id = v_user_id
     ORDER BY uc.created_at DESC NULLS LAST
     LIMIT 1;

    IF v_tenant_id IS NOT NULL THEN
      RETURN v_tenant_id;
    END IF;

    -- Create tenant row
    INSERT INTO public.tenants (id, name)
    VALUES (gen_random_uuid(), v_name)
    RETURNING id INTO v_tenant_id;

    -- Grant owner/admin claim to current user
    INSERT INTO public.user_claims (tenant_id, user_id, role, perms, user_name_snapshot)
    VALUES (
      v_tenant_id,
      v_user_id,
      'owner',
      jsonb_build_object(
        'finance', jsonb_build_object('read', true, 'write', true),
        'classes', jsonb_build_object('read', true, 'write', true)
      ),
      NULLIF(trim(p_display_name), '')
    );

    RETURN v_tenant_id;
  END;
  $$;

  -- Ensure authenticated can execute (ignore if already granted)
  BEGIN
    GRANT EXECUTE ON FUNCTION public.bootstrap_tenant_and_admin(text, text) TO authenticated;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

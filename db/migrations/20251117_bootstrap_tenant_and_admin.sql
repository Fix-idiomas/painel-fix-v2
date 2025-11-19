-- Create bootstrap function used at first login to create a tenant and link the current user as owner.
-- Idempotent: only creates tenant if the user has none.
-- NOTE: Assumes tables public.tenants (id uuid pk, name text, status text, created_at timestamptz default now())
--       and public.user_tenants (tenant_id uuid, user_id uuid, role text, created_at timestamptz default now()).
--       If tenant_settings exists, seeds a default row.

DO $$
BEGIN
  -- Create function only if it doesn't already exist with any signature (single text param)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'bootstrap_tenant_and_admin'
      AND p.pronargs = 1
  ) THEN
    CREATE OR REPLACE FUNCTION public.bootstrap_tenant_and_admin(p_tenant_name text)
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_user_id   uuid := auth.uid();
      v_tenant_id uuid;
      v_name      text := NULLIF(trim(p_tenant_name), '');
    BEGIN
      IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'bootstrap_tenant_and_admin: auth.uid() is null';
      END IF;

      -- If already linked to a tenant, just return it
      SELECT t.id
        INTO v_tenant_id
        FROM public.user_tenants ut
        JOIN public.tenants t ON t.id = ut.tenant_id
       WHERE ut.user_id = v_user_id
       LIMIT 1;

      IF v_tenant_id IS NOT NULL THEN
        RETURN v_tenant_id;
      END IF;

      -- Create tenant
      INSERT INTO public.tenants (id, name, status)
      VALUES (gen_random_uuid(), COALESCE(v_name, 'Nova escola'), 'active')
      RETURNING id INTO v_tenant_id;

      -- Link current user as owner/admin
      INSERT INTO public.user_tenants (tenant_id, user_id, role)
      VALUES (v_tenant_id, v_user_id, 'owner')
      ON CONFLICT DO NOTHING;

      -- Optional seed for tenant_settings
      BEGIN
        INSERT INTO public.tenant_settings (tenant_id, brand_name)
        VALUES (v_tenant_id, COALESCE(v_name, 'Nova escola'))
        ON CONFLICT (tenant_id) DO NOTHING;
      EXCEPTION WHEN undefined_table THEN
        -- ignore if tenant_settings table does not exist
        NULL;
      END;

      RETURN v_tenant_id;
    END;
    $$;

    -- Allow authenticated users to execute
    GRANT EXECUTE ON FUNCTION public.bootstrap_tenant_and_admin(text) TO authenticated;
  END IF;
END $$;

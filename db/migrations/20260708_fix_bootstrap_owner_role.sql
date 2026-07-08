-- Corrige o onboarding (/onboarding → bootstrap_tenant_and_admin).
--
-- Sintoma: "new row for relation \"user_claims\" violates check constraint
-- \"user_claims_role_check\"" ao criar um novo tenant.
--
-- Causa: a função inseria user_claims.role = 'owner', mas o check constraint
-- só permite ('admin','user'). Além disso, NÃO preenchia tenants.owner_user_id,
-- que é o mecanismo real de titularidade — is_owner_current_tenant() confere
-- tenants.owner_user_id = usuário atual (OU role in ('admin','owner')).
--
-- Correção (alinha ao owner que já funciona em produção: owner_user_id setado +
-- role='admin'):
--   1) grava owner_user_id = auth.uid() ao criar o tenant (titularidade);
--   2) insere o claim com role='admin' (válido no constraint e reconhecido como
--      dono via owner_user_id E via role).
-- Não altera o constraint nem introduz um valor de role sem suporte no restante
-- do sistema (is_admin_or_* etc. checam 'admin').

CREATE OR REPLACE FUNCTION public.bootstrap_tenant_and_admin(p_tenant_name text, p_display_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DECLARE
    v_user_id   uuid := auth.uid();
    v_tenant_id uuid;
    v_name      text := COALESCE(NULLIF(trim(p_tenant_name), ''), 'Nova escola');
  BEGIN
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'bootstrap_tenant_and_admin: auth.uid() is null';
    END IF;

    -- Se o usuário já tem claim, retorna o tenant existente (idempotente)
    SELECT uc.tenant_id
      INTO v_tenant_id
      FROM public.user_claims uc
     WHERE uc.user_id = v_user_id
     ORDER BY uc.created_at DESC NULLS LAST
     LIMIT 1;

    IF v_tenant_id IS NOT NULL THEN
      RETURN v_tenant_id;
    END IF;

    -- Cria tenant JÁ com a titularidade (owner_user_id) do criador
    INSERT INTO public.tenants (id, name, owner_user_id)
    VALUES (gen_random_uuid(), v_name, v_user_id)
    RETURNING id INTO v_tenant_id;

    -- Claim do usuário atual: role='admin' (válido no constraint). A titularidade
    -- de dono vem de tenants.owner_user_id (is_owner_current_tenant()).
    INSERT INTO public.user_claims (tenant_id, user_id, role, perms, user_name_snapshot)
    VALUES (
      v_tenant_id,
      v_user_id,
      'admin',
      jsonb_build_object(
        'finance', jsonb_build_object('read', true, 'write', true),
        'classes', jsonb_build_object('read', true, 'write', true)
      ),
      NULLIF(trim(p_display_name), '')
    );

    -- Semeia o trial de 14 dias na mesma transação
    INSERT INTO public.subscriptions (tenant_id, status, trial_end)
    VALUES (v_tenant_id, 'trial', now() + interval '14 days')
    ON CONFLICT (tenant_id) DO NOTHING;

    RETURN v_tenant_id;
  END;
  $function$;

-- PRD-1 — Fundação de entitlement & paywall
-- 1) Estende bootstrap_tenant_and_admin para semear um TRIAL (14 dias) na MESMA
--    transação da criação do tenant — nunca existe tenant sem assinatura.
-- 2) Backfill dos tenants já existentes (trial de cortesia).
-- 3) Marca um conjunto ESPECÍFICO de contas como isentas vitalícias
--    (billing_exempt = true) — preencher a lista antes de aplicar.
--
-- Pré-requisito: 20260620_create_subscriptions.sql aplicado.

-- ──────────────────────────────────────────────────────────────────────────
-- 1) bootstrap_tenant_and_admin: agora também cria a linha de trial.
--    (mantém a assinatura/idempotência da versão anterior)
-- ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE OR REPLACE FUNCTION public.bootstrap_tenant_and_admin(p_tenant_name text, p_display_name text)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
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

    -- Cria tenant
    INSERT INTO public.tenants (id, name)
    VALUES (gen_random_uuid(), v_name)
    RETURNING id INTO v_tenant_id;

    -- Claim de owner para o usuário atual
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

    -- NOVO: semeia o trial de 14 dias na mesma transação
    INSERT INTO public.subscriptions (tenant_id, status, trial_end)
    VALUES (v_tenant_id, 'trial', now() + interval '14 days')
    ON CONFLICT (tenant_id) DO NOTHING;

    RETURN v_tenant_id;
  END;
  $fn$;

  BEGIN
    GRANT EXECUTE ON FUNCTION public.bootstrap_tenant_and_admin(text, text) TO authenticated;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 2) Backfill: garante uma assinatura (trial de cortesia) p/ todo tenant atual.
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO public.subscriptions (tenant_id, status, trial_end)
SELECT t.id, 'trial', now() + interval '14 days'
FROM public.tenants t
LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
WHERE s.id IS NULL
ON CONFLICT (tenant_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) Isenção vitalícia para contas ESPECÍFICAS (decisão travada com o dono).
--    >>> SUBSTITUIR a lista de e-mails abaixo antes de aplicar em produção. <<<
--    Alternativa: usar tenant_id direto (ver bloco comentado).
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.subscriptions sub
   SET billing_exempt = true,
       status = 'active'
 WHERE sub.tenant_id IN (
   SELECT uc.tenant_id
     FROM public.user_claims uc
    WHERE uc.role = 'owner'
      AND lower(uc.user_email_snapshot) IN (
        -- 'email-do-dono-1@exemplo.com',
        -- 'email-do-dono-2@exemplo.com'
        ''  -- placeholder: não casa com ninguém até preencher
      )
 );

-- Alternativa por tenant_id (descomentar e preencher):
-- UPDATE public.subscriptions
--    SET billing_exempt = true, status = 'active'
--  WHERE tenant_id IN ('<tenant_id_1>', '<tenant_id_2>');

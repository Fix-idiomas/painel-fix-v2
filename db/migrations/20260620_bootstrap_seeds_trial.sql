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
    VALUES (v_tenant_id, 'trial', now() + interval '30 days')
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
SELECT t.id, 'trial', now() + interval '30 days'
FROM public.tenants t
LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
WHERE s.id IS NULL
ON CONFLICT (tenant_id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────
-- 3) Isenção de cortesia: contas existentes ATÉ a data desta migração ("por
--    enquanto", decisão interina). Contas criadas DEPOIS seguem o fluxo normal
--    de trial → cobrança (billing_exempt = false default).
--
--    O corte por `tenants.created_at` torna a migração SEGURA para reaplicar:
--    rerodá-la NÃO isenta pagantes futuros (criados após o corte).
--    Para isentar apenas contas específicas, use o bloco comentado abaixo.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE public.subscriptions sub
   SET billing_exempt = true
  FROM public.tenants t
 WHERE t.id = sub.tenant_id
   AND sub.billing_exempt = false
   AND t.created_at < timestamptz '2026-06-26 00:00:00+00';  -- corte: contas atuais

-- Alternativa — isentar apenas contas específicas (descomentar e preencher):
-- UPDATE public.subscriptions sub
--    SET billing_exempt = true
--  WHERE sub.tenant_id IN (
--    SELECT uc.tenant_id
--      FROM public.user_claims uc
--      JOIN auth.users u ON u.id = uc.user_id
--     WHERE lower(u.email) IN ('email-1@exemplo.com', 'email-2@exemplo.com')
--  );

-- Verificação do fix de onboarding (bootstrap_tenant_and_admin).
-- SOMENTE LEITURA — não escreve nada; seguro rodar em qualquer ambiente
-- (Supabase SQL editor, psql, CI). Falha com RAISE EXCEPTION se detectar
-- regressão; em sucesso emite NOTICE 'PASS'.
--
-- Contexto: o bug original inseria user_claims.role='owner' (o check constraint
-- só permite admin/user) e não gravava tenants.owner_user_id. Este script trava
-- essas duas condições para o CI/quem quiser conferir manualmente após deploy.
--
-- Uso:
--   psql "$DATABASE_URL" -f db/verify/bootstrap_tenant_and_admin.verify.sql
--   (ou cole no Supabase SQL editor)

DO $$
DECLARE
  v_src   text;
  v_check text;
  v_owner text;
BEGIN
  -- 1) função existe
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'bootstrap_tenant_and_admin' AND n.nspname = 'public';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'FAIL: public.bootstrap_tenant_and_admin não existe';
  END IF;

  -- 2) grava a titularidade (owner_user_id)
  IF position('owner_user_id' IN v_src) = 0 THEN
    RAISE EXCEPTION 'FAIL: bootstrap não grava tenants.owner_user_id (titularidade)';
  END IF;

  -- 3) insere role='admin' e NÃO reintroduziu role='owner'
  IF position('''admin''' IN v_src) = 0 THEN
    RAISE EXCEPTION 'FAIL: bootstrap não insere o claim com role=admin';
  END IF;
  IF position('''owner''' IN v_src) > 0 THEN
    RAISE EXCEPTION 'FAIL: bootstrap voltou a usar role=owner (viola user_claims_role_check)';
  END IF;

  -- 4) o constraint aceita 'admin'
  SELECT pg_get_constraintdef(c.oid) INTO v_check
  FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid
  WHERE r.relname = 'user_claims' AND c.conname = 'user_claims_role_check';
  IF v_check IS NULL OR position('admin' IN v_check) = 0 THEN
    RAISE EXCEPTION 'FAIL: user_claims_role_check não permite role=admin (%).', v_check;
  END IF;

  -- 5) is_owner_current_tenant() considera a titularidade por owner_user_id
  SELECT pg_get_functiondef(p.oid) INTO v_owner
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'is_owner_current_tenant' AND n.nspname = 'public';
  IF v_owner IS NULL OR position('owner_user_id' IN v_owner) = 0 THEN
    RAISE EXCEPTION 'FAIL: is_owner_current_tenant não confere tenants.owner_user_id';
  END IF;

  RAISE NOTICE 'PASS: bootstrap grava owner_user_id + role=admin; constraint e is_owner OK';
END $$;

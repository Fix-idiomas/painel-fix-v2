-- Backfill de tenants.owner_user_id para tenants legados criados ANTES do
-- bootstrap gravar a titularidade (ver 20260708_fix_bootstrap_owner_role.sql).
--
-- Regra: o dono passa a ser o claim 'admin' mais antigo do tenant. Só afeta
-- tenants com owner_user_id NULL E que tenham ao menos um admin. Idempotente
-- (só toca linhas NULL), então re-rodar é no-op.
--
-- Fora de escopo (intencional): tenants sem nenhum admin não são tocados — não
-- há usuário para atribuir. Caso conhecido: o seed 'Fix Idiomas'
-- (11111111-1111-4111-8111-111111111111) tem dados mas ZERO user_claims;
-- ninguém o acessa pela app (RLS bloqueia sem claim). Atribuir/limpar esse seed
-- é decisão separada (envolveria criar um vínculo ou apagar dados) e não é feito
-- aqui.

UPDATE public.tenants t
SET owner_user_id = sub.user_id
FROM (
  SELECT DISTINCT ON (uc.tenant_id) uc.tenant_id, uc.user_id
  FROM public.user_claims uc
  WHERE uc.role = 'admin'
  ORDER BY uc.tenant_id, uc.created_at ASC NULLS LAST
) sub
WHERE t.owner_user_id IS NULL
  AND t.id = sub.tenant_id;

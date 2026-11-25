-- Segurança — alerta do Supabase "rls_disabled_in_public" (2026-11-22):
-- public.audit_log estava SEM RLS e com grants para anon/authenticated → qualquer
-- um com a URL do projeto + anon key (pública, vai no navegador) podia ler,
-- inserir, alterar e apagar linhas.
--
-- A tabela não é usada pelo app (1 linha de teste de 2025-09; nenhum trigger nem
-- código chama fn_audit_log). Fechamos o acesso direto:
--   - RLS ligada SEM policies → anon/authenticated não veem nem gravam nada;
--     service_role e postgres (servidor) continuam com acesso.
--   - Revoga os grants de anon/authenticated na tabela.
--   - Revoga EXECUTE de fn_audit_log (SECURITY INVOKER; permitia gravar log com
--     qualquer tenant_id).
-- Se um dia houver auditoria pelo app, criar policies próprias (tenant_id =
-- current_tenant_id()) ou gravar via função SECURITY DEFINER.
--
-- Idempotente.

alter table public.audit_log enable row level security;

revoke all on table public.audit_log from anon, authenticated;

revoke execute on function public.fn_audit_log(uuid, text, text, text, jsonb, jsonb, uuid, text, text, text)
  from public, anon, authenticated;

-- ROLLBACK:
--   alter table public.audit_log disable row level security;
--   grant all on table public.audit_log to anon, authenticated;
--   grant execute on function public.fn_audit_log(uuid, text, text, text, jsonb, jsonb, uuid, text, text, text)
--     to public, anon, authenticated;

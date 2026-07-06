-- Owner de 1ª classe: o dono do tenant (tenants.owner_user_id) tem acesso total
-- SEM depender de user_claims.role='admin'.
--
-- Antes, todo o gate de "acesso total" checava só role='admin'. Se um dono
-- tivesse role diferente (ou fosse dono só por titularidade), ficaria de fora.
-- Agora as funções também reconhecem owner_user_id e role='owner'.
--
-- Tudo GRANT-ONLY (adiciona um OR) → não remove acesso de ninguém.
-- is_admin_or_registry_read/write são aliases de is_admin_or_classes_read/write,
-- então cobrir as "classes" cobre professores/registro também.

-- 1) is_owner_current_tenant — usado nas policies escopadas (turmas/alunos/aulas/...)
create or replace function public.is_owner_current_tenant()
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public', 'auth'
 set row_security to 'off'
as $function$
declare
  v_tid uuid := public.current_tenant_id_norlse();
  v_uid uuid := public.current_user_uuid();
begin
  if v_tid is null or v_uid is null then
    return false;
  end if;
  return exists (
    select 1 from public.tenants t where t.id = v_tid and t.owner_user_id = v_uid
  ) or exists (
    select 1 from public.user_claims uc
    where uc.user_id = v_uid and uc.tenant_id = v_tid and uc.role in ('admin','owner')
  );
end
$function$;

-- 2) is_admin_or_classes_read (e alias is_admin_or_registry_read)
create or replace function public.is_admin_or_classes_read(p_tenant uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    exists (select 1 from public.tenants t where t.id = p_tenant and t.owner_user_id = auth.uid())
    or exists (
      select 1 from public.user_claims uc
      where uc.tenant_id = p_tenant and uc.user_id = auth.uid()
        and (
          uc.role in ('admin','owner')
          or coalesce((uc.perms->'classes'->>'read')::boolean, false)
          or coalesce((uc.perms->'classes'->>'write')::boolean, false)
        )
    );
$function$;

-- 3) is_admin_or_classes_write (e alias is_admin_or_registry_write)
create or replace function public.is_admin_or_classes_write(p_tenant uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    exists (select 1 from public.tenants t where t.id = p_tenant and t.owner_user_id = auth.uid())
    or exists (
      select 1 from public.user_claims uc
      where uc.tenant_id = p_tenant and uc.user_id = auth.uid()
        and (
          uc.role in ('admin','owner')
          or coalesce((uc.perms->'classes'->>'write')::boolean, false)
        )
    );
$function$;

-- 4) is_admin_or_owner (billing) — vira SECURITY DEFINER p/ ler tenants/user_claims
--    de forma confiável ao detectar o dono por titularidade.
create or replace function public.is_admin_or_owner(p_tenant uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    exists (select 1 from public.tenants t where t.id = p_tenant and t.owner_user_id = auth.uid())
    or exists (
      select 1 from public.user_claims c
      where c.user_id = auth.uid() and c.tenant_id = p_tenant and c.role in ('owner','admin')
    );
$function$;

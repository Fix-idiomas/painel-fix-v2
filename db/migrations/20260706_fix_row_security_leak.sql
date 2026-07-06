-- Corrige vazamento de row_security que quebrava o lançamento de aulas.
--
-- Bug: várias funções SECURITY DEFINER desligavam a RLS com
--   perform set_config('row_security','off', true);   -- is_local = TRANSAÇÃO
-- O 3º arg `true` é escopo de TRANSAÇÃO, não de função → o row_security=off
-- "vazava" para o resto da transação. Quando, na MESMA transação, um caminho
-- não-definer lia uma tabela com RLS (ex.: current_teacher_id() lendo `teachers`
-- num trigger/policy da criação de sessão), o Postgres estourava:
--   ERROR 42501: query would be affected by row-level security policy for table "teachers"
--
-- A leitura de `turmas` (após a migration de escopo por professor) passou a
-- avaliar policies que chamam essas funções, disparando o vazamento e quebrando
-- a criação de sessões para admin/owner.
--
-- Correção: mover o desligamento da RLS para a cláusula de cabeçalho
--   SET row_security TO 'off'
-- que é escopo de FUNÇÃO (o Postgres salva e RESTAURA o valor ao sair, mesmo em
-- erro) → sem vazamento. Comportamento interno idêntico (o dono da função tem
-- privilégio de bypass, então já funcionava). Elimina a classe inteira do bug.

-- 1) current_tenant_id_norlse — base, chamada por quase tudo
create or replace function public.current_tenant_id_norlse()
 returns uuid
 language plpgsql
 stable security definer
 set row_security to 'off'
as $function$
declare
  v_uid uuid := coalesce(
    auth.uid(),
    nullif((current_setting('request.jwt.claims', true)::jsonb)->>'sub','')::uuid
  );
  v_tenant uuid;
begin
  v_tenant := nullif((current_setting('request.jwt.claims', true)::jsonb)->>'tenant_id','')::uuid;
  if v_tenant is not null then
    return v_tenant;
  end if;
  if v_uid is null then
    return null;
  end if;
  select uc.tenant_id into v_tenant
  from public.user_claims uc
  where uc.user_id = v_uid
  limit 1;
  return v_tenant;
end
$function$;

-- 2) is_owner_current_tenant
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
  v_is boolean := false;
begin
  if v_tid is null or v_uid is null then
    return false;
  end if;
  select true into v_is
  from public.user_claims uc
  where uc.user_id = v_uid
    and uc.tenant_id = v_tid
    and uc.role = 'admin'
  limit 1;
  return coalesce(v_is, false);
end
$function$;

-- 3) can_teacher_see_student
create or replace function public.can_teacher_see_student(p_student_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public', 'auth'
 set row_security to 'off'
as $function$
declare
  v_tid uuid := public.current_tenant_id_norlse();
  v_teacher uuid := public.current_teacher_id();
  v_has boolean := false;
begin
  if v_tid is null or v_teacher is null or p_student_id is null then
    return false;
  end if;
  select true into v_has
  from public.turma_members tm
  join public.turmas t on t.id = tm.turma_id and t.tenant_id = tm.tenant_id
  where tm.tenant_id = v_tid
    and tm.student_id = p_student_id
    and t.teacher_id = v_teacher
  limit 1;
  return coalesce(v_has, false);
end
$function$;

-- 4) can_teacher_see_turma
create or replace function public.can_teacher_see_turma(p_turma_id uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public', 'auth'
 set row_security to 'off'
as $function$
declare
  v_tid uuid := public.current_tenant_id_norlse();
  v_teacher uuid := public.current_teacher_id();
  v_has boolean := false;
begin
  if v_tid is null or v_teacher is null or p_turma_id is null then
    return false;
  end if;
  select true into v_has
  from public.turmas t
  where t.id = p_turma_id and t.tenant_id = v_tid and t.teacher_id = v_teacher
  limit 1;
  return coalesce(v_has, false);
end
$function$;

-- 5) _ensure_teacher_user_uuid
create or replace function public._ensure_teacher_user_uuid(p_tenant uuid, p_teacher_id uuid)
 returns uuid
 language plpgsql
 security definer
 set row_security to 'off'
as $function$
declare
  v_sub uuid;
begin
  update public.teachers
     set user_id_uuid = coalesce(user_id_uuid, gen_random_uuid())
   where tenant_id = p_tenant
     and id = p_teacher_id
  returning user_id_uuid into v_sub;

  if v_sub is null then
    select user_id_uuid into v_sub
    from public.teachers
    where tenant_id = p_tenant
      and id = p_teacher_id
    limit 1;
  end if;

  return v_sub;
end
$function$;

-- Fecha vazamento de leitura ENTRE PROFESSORES dentro do tenant.
--
-- Problema: policies PERMISSIVE se somam (OR). Um professor (member) precisa de
-- `classes.read/write` para trabalhar, e isso destravava a leitura de TUDO:
--   - turmas: `turmas_select` (tenant inteiro, SEM checagem) + `turmas_select_classes`
--     (is_admin_or_classes_read) → via qualquer classes.read.
--   - students: `students_select_registry` == is_admin_or_classes_read → idem.
-- O `students_select_teacher_scope` existia mas nunca RESTRINGE (é OR), e não havia
-- equivalente para turmas.
--
-- Modelo pretendido: admin/owner veem tudo; professor vê só as turmas onde
-- turmas.teacher_id = current_teacher_id() e os alunos matriculados nelas
-- (can_teacher_see_student). Pré-requisito de dados: cada login-professor precisa
-- estar vinculado ao seu teachers.user_id_uuid (backfill feito à parte, fora do repo,
-- por ser dado específico de produção).
--
-- Idempotente (IF EXISTS / DROP POLICY / OR REPLACE).

-- ── Helper: professor atual enxerga a turma? ────────────────────────────────
-- SECURITY DEFINER (roda como owner → bypassa RLS de `teachers`), no MESMO padrão
-- de can_teacher_see_student. NÃO usar current_teacher_id() CRU dentro da policy:
-- ele é SECURITY INVOKER e lê `teachers` sob RLS, o que dispara
-- "query would be affected by row-level security policy" e quebra a leitura.
create or replace function public.can_teacher_see_turma(p_turma_id uuid)
returns boolean
language plpgsql
stable security definer set search_path to 'public', 'auth'
as $$
declare
  v_tid uuid := public.current_tenant_id_norlse();
  v_teacher uuid := public.current_teacher_id();
  v_has boolean := false;
begin
  perform set_config('row_security','off', true);
  if v_tid is null or v_teacher is null or p_turma_id is null then
    return false;
  end if;
  select true into v_has
  from public.turmas t
  where t.id = p_turma_id and t.tenant_id = v_tid and t.teacher_id = v_teacher
  limit 1;
  return coalesce(v_has, false);
end;
$$;

-- ── TURMAS ──────────────────────────────────────────────────────────────────
-- Remove a leitura tenant-wide aberta (o vazamento principal) e a via classes.read.
drop policy if exists turmas_select          on public.turmas;
drop policy if exists turmas_select_classes  on public.turmas;

-- Admin/owner do tenant vê todas as turmas (is_owner_current_tenant = role admin,
-- SECURITY DEFINER → não depende da RLS de user_claims).
drop policy if exists turmas_select_admin on public.turmas;
create policy turmas_select_admin on public.turmas
  for select
  using (tenant_id = current_tenant_id() and is_owner_current_tenant());

-- Professor vê apenas as turmas das quais é o responsável.
drop policy if exists turmas_select_teacher_scope on public.turmas;
create policy turmas_select_teacher_scope on public.turmas
  for select
  using (tenant_id = current_tenant_id() and can_teacher_see_turma(id));

-- ── STUDENTS ────────────────────────────────────────────────────────────────
-- Remove a leitura via classes.read (o vazamento). Admin continua via
-- students_select_owner_tenant; professor via students_select_teacher_scope.
drop policy if exists students_select_registry on public.students;

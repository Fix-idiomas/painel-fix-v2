-- Fecha o vazamento de AULAS (sessions) entre professores dentro do tenant.
--
-- Mesmo padrão do vazamento de turmas/alunos: a policy `sessions_select` era
-- `tenant_id = current_tenant_id()` (tenant inteiro, sem checagem) → qualquer
-- professor via TODAS as aulas do tenant. `sessions_select_classes`
-- (is_admin_or_classes_read) reforçava via classes.read.
--
-- Modelo: admin/owner veem tudo; professor vê as aulas das turmas das quais é
-- responsável (can_teacher_see_turma) OU aulas snapshotadas a ele
-- (teacher_id_snapshot = current_teacher_id(), cobre aulas avulsas sem turma).
--
-- Idempotente (DROP POLICY IF EXISTS).

drop policy if exists sessions_select          on public.sessions;
drop policy if exists sessions_select_classes  on public.sessions;

create policy sessions_select_admin on public.sessions
  for select
  using (tenant_id = current_tenant_id() and is_owner_current_tenant());

create policy sessions_select_teacher_scope on public.sessions
  for select
  using (
    tenant_id = current_tenant_id()
    and (
      teacher_id_snapshot = current_teacher_id()
      or can_teacher_see_turma(turma_id)
    )
  );

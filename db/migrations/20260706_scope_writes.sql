-- Fecha o vazamento de ESCRITA entre professores dentro do tenant.
--
-- Antes: policies de INSERT/UPDATE/DELETE usavam is_admin_or_classes_write /
-- is_admin_or_registry_write / current_can('classes','write') — todas = "admin OU
-- classes.write" → um professor com classes.write escrevia QUALQUER turma, aluno,
-- aula e matrícula. turma_members tinha ainda `_tenant` (SEM checagem alguma).
--
-- Modelo (espelha a leitura): admin/owner escrevem tudo; professor gerencia só o
-- DELE. Definição de turma = admin; aulas (sessions) e roster (turma_members) das
-- turmas dele = professor; aluno = admin cria/exclui, professor edita só os dele.
--
-- "admin/owner" = is_owner_current_tenant() (role='admin', SECURITY DEFINER).
-- As policies _owner (professor) e as RESTRICTIVE de entitlement (_ent_*) são
-- mantidas. Idempotente (DROP POLICY IF EXISTS).

-- ===== TURMAS: criar/editar/excluir turma = só admin/owner =====
drop policy if exists turmas_insert_classes on public.turmas;
drop policy if exists turmas_insert_owner   on public.turmas;
drop policy if exists turmas_update_classes on public.turmas;
drop policy if exists turmas_update_owner   on public.turmas;
drop policy if exists turmas_delete_classes on public.turmas;
drop policy if exists turmas_delete_owner   on public.turmas;

create policy turmas_insert_admin on public.turmas
  for insert with check (tenant_id = current_tenant_id() and is_owner_current_tenant());
create policy turmas_update_admin on public.turmas
  for update using (tenant_id = current_tenant_id() and is_owner_current_tenant())
         with check (tenant_id = current_tenant_id() and is_owner_current_tenant());
create policy turmas_delete_admin on public.turmas
  for delete using (tenant_id = current_tenant_id() and is_owner_current_tenant());

-- ===== SESSIONS (aulas): admin/owner OU professor dono (_owner mantido) =====
drop policy if exists sessions_insert_classes on public.sessions;
drop policy if exists sessions_update_classes on public.sessions;
drop policy if exists sessions_delete_classes on public.sessions;

create policy sessions_insert_admin on public.sessions
  for insert with check (tenant_id = current_tenant_id() and is_owner_current_tenant());
create policy sessions_update_admin on public.sessions
  for update using (tenant_id = current_tenant_id() and is_owner_current_tenant())
         with check (tenant_id = current_tenant_id() and is_owner_current_tenant());
create policy sessions_delete_admin on public.sessions
  for delete using (tenant_id = current_tenant_id() and is_owner_current_tenant());

-- ===== TURMA_MEMBERS (matrículas): admin/owner OU professor dono; remove _tenant =====
drop policy if exists turma_members_insert_classes on public.turma_members;
drop policy if exists turma_members_insert_tenant  on public.turma_members;
drop policy if exists turma_members_delete_classes on public.turma_members;
drop policy if exists turma_members_delete_tenant  on public.turma_members;

create policy turma_members_insert_admin on public.turma_members
  for insert with check (tenant_id = current_tenant_id() and is_owner_current_tenant());
create policy turma_members_delete_admin on public.turma_members
  for delete using (tenant_id = current_tenant_id() and is_owner_current_tenant());

-- ===== STUDENTS: criar/excluir = admin; editar = admin OU professor do aluno =====
drop policy if exists students_insert_registry on public.students;
drop policy if exists students_update_registry on public.students;
drop policy if exists students_delete_registry on public.students;

create policy students_insert_admin on public.students
  for insert with check (tenant_id = current_tenant_id() and is_owner_current_tenant());
create policy students_delete_admin on public.students
  for delete using (tenant_id = current_tenant_id() and is_owner_current_tenant());
create policy students_update_admin on public.students
  for update using (tenant_id = current_tenant_id() and is_owner_current_tenant())
         with check (tenant_id = current_tenant_id() and is_owner_current_tenant());
create policy students_update_teacher_scope on public.students
  for update using (tenant_id = current_tenant_id() and can_teacher_see_student(id))
         with check (tenant_id = current_tenant_id() and can_teacher_see_student(id));

-- Escopo de presença (attendance) — mesmo modelo de aulas/turmas/alunos.
--
-- attendance tinha leitura (attendance_select_classes) e escrita
-- (attendance_*_classes) tenant-wide via classes.read/write → professor via/editava
-- a presença de QUALQUER turma. Já existiam as _owner (via dono da sessão).
--
-- Agora: admin/owner tudo; professor só a presença das aulas DELE (sessão cujo
-- teacher_id_snapshot = current_teacher_id()). Idempotente.

-- SELECT
drop policy if exists attendance_select_classes on public.attendance;
create policy attendance_select_admin on public.attendance
  for select using (tenant_id = current_tenant_id() and is_owner_current_tenant());
create policy attendance_select_teacher_scope on public.attendance
  for select using (
    tenant_id = current_tenant_id()
    and exists (
      select 1 from public.sessions s
      where s.id = attendance.session_id
        and s.tenant_id = current_tenant_id()
        and s.teacher_id_snapshot = current_teacher_id()
    )
  );

-- WRITE: tenant-wide _classes -> admin/owner; mantém _owner (professor)
drop policy if exists attendance_insert_classes on public.attendance;
drop policy if exists attendance_update_classes on public.attendance;
drop policy if exists attendance_delete_classes on public.attendance;

create policy attendance_insert_admin on public.attendance
  for insert with check (tenant_id = current_tenant_id() and is_owner_current_tenant());
create policy attendance_update_admin on public.attendance
  for update using (tenant_id = current_tenant_id() and is_owner_current_tenant())
         with check (tenant_id = current_tenant_id() and is_owner_current_tenant());
create policy attendance_delete_admin on public.attendance
  for delete using (tenant_id = current_tenant_id() and is_owner_current_tenant());

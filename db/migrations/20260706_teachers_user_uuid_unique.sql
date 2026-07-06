-- Vínculo login↔professor: garante 1 login por professor por tenant.
--
-- teachers.user_id_uuid = auth.users.id é o elo que a RLS usa (current_teacher_id).
-- Sem essa restrição, dois professores do mesmo tenant poderiam apontar para o
-- mesmo login (ou o mesmo professor ser vinculado duas vezes por corrida).
-- Parcial (só quando vinculado) para não colidir com professores sem acesso.

create unique index if not exists teachers_tenant_user_uuid_uniq
  on public.teachers (tenant_id, user_id_uuid)
  where user_id_uuid is not null;

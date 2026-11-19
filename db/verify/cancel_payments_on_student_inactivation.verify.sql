-- Verificação read-only da regra "aluno inativo não tem mensalidade pendente".
-- Esperado: trigger presente (1 linha) e ZERO pendências de alunos inativos.

select tgname, pg_get_triggerdef(t.oid) as def
  from pg_trigger t
 where t.tgrelid = 'public.students'::regclass
   and t.tgname  = 'trg_students_cancel_payments_on_inactivation';

select count(*) as pendentes_de_inativos  -- deve ser 0
  from public.payments p
  join public.students s on s.id = p.student_id and s.tenant_id = p.tenant_id
 where s.status = 'inativo'
   and p.status = 'pending';

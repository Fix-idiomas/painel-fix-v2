-- Regra de negócio: ao INATIVAR um aluno, todas as suas mensalidades PENDENTES
-- (vencidas e a vencer) são CANCELADAS, saindo de KPIs, listas, inadimplência e
-- lembretes. Mensalidades PAGAS permanecem (receita realizada/histórico).
-- Reativar o aluno NÃO restaura as canceladas: os meses seguintes são gerados
-- normalmente pela Prévia/cron (que só consideram alunos 'ativo').
--
-- Por que trigger (e não o front/gateway):
--   - Quem pode inativar aluno (owner OU professor do aluno — policies
--     students_update_admin / students_update_teacher_scope) não é o mesmo
--     conjunto de quem pode editar payments (payments_update_finance). Feito no
--     cliente, o UPDATE em payments de um professor afetaria 0 linhas SEM erro
--     (RLS filtra), deixando pendências órfãs em silêncio.
--   - Atômico: inativação e cancelamento na MESMA transação (ou nenhum).
--   - Cobre qualquer caminho (UI, SQL, futuras rotas).
--
-- Segurança (ver docs/SECURITY.md → Footguns de SECURITY DEFINER):
--   - SECURITY DEFINER só para o efeito colateral; o UPDATE em students que o
--     dispara já passou pela RLS (tenant + escopo + entitlement RESTRICTIVE).
--   - Escopo estrito: tenant_id = NEW.tenant_id AND student_id = NEW.id.
--   - row_security desligado via CLÁUSULA DE CABEÇALHO (escopo de função,
--     restaurado ao sair) — nunca set_config(..., true).
--
-- Idempotente: create or replace + drop trigger if exists.

create or replace function public.cancel_pending_payments_on_student_inactivation()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
 set row_security to 'off'
as $function$
begin
  update public.payments
     set status      = 'canceled',
         canceled_at = now(),
         cancel_note = 'Aluno inativado',
         paid_at     = null
   where tenant_id  = new.tenant_id
     and student_id = new.id
     and status     = 'pending';
  return new;
end
$function$;

revoke all on function public.cancel_pending_payments_on_student_inactivation() from public, anon, authenticated;

drop trigger if exists trg_students_cancel_payments_on_inactivation on public.students;
create trigger trg_students_cancel_payments_on_inactivation
  after update of status on public.students
  for each row
  when (new.status = 'inativo' and old.status is distinct from 'inativo')
  execute function public.cancel_pending_payments_on_student_inactivation();

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- drop trigger if exists trg_students_cancel_payments_on_inactivation on public.students;
-- drop function if exists public.cancel_pending_payments_on_student_inactivation();

-- Backfill da regra de 20261113_cancel_payments_on_student_inactivation.sql:
-- cancela as mensalidades PENDENTES de alunos que JÁ estavam inativos antes do
-- trigger existir (pendências órfãs que inflavam "a receber", inadimplência e
-- disparavam lembretes diários). Pagas não são tocadas.
--
-- Levantamento em 2026-11-13: 38 mensalidades em 2 tenants (35 na Fix Idiomas,
-- R$ 8.353,00, de 2025-10 a 2026-11; 3 na Escola Caos, R$ 300,00).
--
-- cancel_note diferente do trigger p/ rastrear/desfazer só este lote.
-- Idempotente: re-rodar não afeta nada (só pega status = 'pending').

update public.payments p
   set status      = 'canceled',
       canceled_at = now(),
       cancel_note = 'Aluno inativado (backfill 2026-11-13)',
       paid_at     = null
  from public.students s
 where s.id        = p.student_id
   and s.tenant_id = p.tenant_id
   and s.status    = 'inativo'
   and p.status    = 'pending';

-- ── ROLLBACK (reabre só este lote) ──────────────────────────────────────────
-- update public.payments
--    set status = 'pending', canceled_at = null, cancel_note = null
--  where cancel_note = 'Aluno inativado (backfill 2026-11-13)';

-- Auditoria A7 — finance_reminders_log: tenant_id preenchido pelo banco.
--
-- A coluna tenant_id não tinha DEFAULT, então a tela de Mensalidades enviava o
-- tenant_id do frontend (proibido pelas regras do projeto) — e, junto com
-- status 'error' (o check só aceita 'sent'|'failed') e sent_at NULL (coluna NOT
-- NULL), nenhum lembrete manual jamais foi registrado (tabela com 0 linhas).
-- Com o DEFAULT, o frontend deixa de enviar tenant_id; a policy de INSERT
-- (tenant_id = current_tenant_id()) continua valendo. O cron (service role)
-- segue gravando tenant_id explícito.
--
-- Idempotente.

alter table public.finance_reminders_log
  alter column tenant_id set default public.current_tenant_id();

-- ROLLBACK: alter table public.finance_reminders_log alter column tenant_id drop default;

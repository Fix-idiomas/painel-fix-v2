-- Backfill dos horários das aulas (sessions) que ficaram em 00:00.
--
-- Origem: ensureSessionsFromRules gerava a sessão só com a DATA (sem hora),
-- ignorando o horário da meeting_rule → a aula nascia à meia-noite e a agenda
-- (e o modal Detalhes) mostrava 00:00. O código já foi corrigido para gravar
-- data + hora; esta migration conserta as linhas já existentes.
--
-- Regra: para cada sessão em 00:00 (fuso America/Sao_Paulo) cuja turma tenha
-- meeting_rules, usa o horário da regra do MESMO dia da semana; se não houver
-- regra do dia, o horário predominante da turma (primeira regra com horário).
-- Mantém o DIA (só ajusta a hora). Sessões sem regra com horário ficam como estão.
--
-- Verificado antes de aplicar: 0 colisões (nem no lote, nem com sessões existentes).
-- Idempotente: após rodar não sobram sessões 00:00 com regra, então re-rodar é no-op.

with cand as (
  select s.id,
         (s.date at time zone 'America/Sao_Paulo') as sp_ts,
         extract(dow from (s.date at time zone 'America/Sao_Paulo'))::int as dow,
         t.meeting_rules
  from public.sessions s
  join public.turmas t on t.id = s.turma_id
  where to_char(s.date at time zone 'America/Sao_Paulo', 'HH24:MI') = '00:00'
    and t.meeting_rules is not null
),
resolved as (
  select c.id, c.sp_ts,
    coalesce(
      (select r->>'time' from jsonb_array_elements(c.meeting_rules) r
         where (r->>'weekday')::int = c.dow and nullif(r->>'time','') is not null limit 1),
      (select r->>'time' from jsonb_array_elements(c.meeting_rules) r
         where nullif(r->>'time','') is not null limit 1)
    ) as rule_time
  from cand c
)
update public.sessions s
set date = (
  date_trunc('day', r.sp_ts)
  + make_interval(hours => split_part(r.rule_time, ':', 1)::int,
                  mins  => split_part(r.rule_time, ':', 2)::int)
) at time zone 'America/Sao_Paulo'
from resolved r
where s.id = r.id
  and r.rule_time is not null;

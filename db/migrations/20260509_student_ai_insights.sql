-- 20260509_student_ai_insights.sql
-- Tabela para cachear as análises de IA do histórico de evolução do aluno.
-- A rota /api/ai/student-insights calcula um sha256 do payload enviado à IA
-- (resumo + presenças mais recentes); se já existir uma análise com o
-- mesmo hash, retorna a cacheada sem chamar a IA de novo.

create table if not exists public.student_ai_insights (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  student_id    uuid not null references public.students(id) on delete cascade,
  payload_hash  text not null,
  output        jsonb not null,
  model         text not null,
  input_tokens  int,
  output_tokens int,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id)
);

create index if not exists student_ai_insights_lookup_idx
  on public.student_ai_insights (student_id, payload_hash, created_at desc);

alter table public.student_ai_insights enable row level security;

-- Membros do tenant podem ler insights do tenant
drop policy if exists student_ai_insights_select on public.student_ai_insights;
create policy student_ai_insights_select
  on public.student_ai_insights
  for select
  using (tenant_id = (select current_tenant_id()));

-- Insert só com tenant_id batendo (server-side via route handler)
drop policy if exists student_ai_insights_insert on public.student_ai_insights;
create policy student_ai_insights_insert
  on public.student_ai_insights
  for insert
  with check (tenant_id = (select current_tenant_id()));

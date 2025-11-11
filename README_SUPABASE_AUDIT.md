# Supabase Audit Pack (RLS, RPC, Triggers, Views, FKs, Índices)

Este documento reúne consultas SQL para inventariar, de forma segura, os artefatos do seu banco no Supabase antes de qualquer mudança. Rode no SQL Editor do Supabase (ou via psql) e salve os resultados.

Observação importante: ajuste o schema caso você use algo além de `public`.

## Como usar

- Abra o SQL Editor do Supabase e execute os blocos por seção.
- Exporte o resultado (CSV/JSON) ou copie e cole os trechos relevantes.
- Se preferir psql no Windows PowerShell, veja a seção "Via psql (opcional)" ao final.

---

## 1) Tabelas, colunas e tipos

```sql
-- Todas as tabelas do schema
select table_schema, table_name
from information_schema.tables
where table_schema in ('public')
  and table_type = 'BASE TABLE'
order by table_schema, table_name;

-- Colunas por tabela
select table_schema, table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema in ('public')
order by table_schema, table_name, ordinal_position;
```

## 2) Chaves primárias, FKs e constraints

```sql
-- FKs
select
  tc.table_schema, tc.table_name, kcu.column_name,
  ccu.table_schema as foreign_table_schema,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name,
  tc.constraint_name
from information_schema.table_constraints as tc
join information_schema.key_column_usage as kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage as ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema in ('public')
order by tc.table_name;

-- PKs
select tc.table_schema, tc.table_name, kcu.column_name, tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
where tc.constraint_type = 'PRIMARY KEY'
  and tc.table_schema in ('public')
order by tc.table_name, kcu.ordinal_position;

-- Constraints únicas
select tc.table_schema, tc.table_name, tc.constraint_name
from information_schema.table_constraints tc
where tc.constraint_type = 'UNIQUE'
  and tc.table_schema in ('public')
order by tc.table_name, tc.constraint_name;
```

## 3) Índices

```sql
select
  schemaname as table_schema,
  tablename as table_name,
  indexname,
  indexdef
from pg_indexes
where schemaname in ('public')
order by tablename, indexname;
```

## 4) RLS e Policies

```sql
-- Tabelas com RLS habilitado
select n.nspname as table_schema, c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname in ('public')
order by n.nspname, c.relname;

-- Policies detalhadas (predicados)
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public')
order by tablename, policyname, cmd;
```

### 4.1) Policies específicas (Turmas e relacionadas)

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('turmas','turma_members','sessions','attendance')
order by tablename, policyname, cmd;
```

## 5) Triggers

```sql
select event_object_schema as table_schema,
       event_object_table as table_name,
       trigger_name,
       action_timing,
       event_manipulation as event,
       action_statement
from information_schema.triggers
where event_object_schema in ('public')
order by event_object_table, trigger_name;
```

## 6) Views

```sql
select table_schema, table_name, view_definition
from information_schema.views
where table_schema in ('public')
order by table_name;
```

## 7) Funções e RPCs

```sql
-- Lista funções (inclui RPCs expostas pelo PostgREST)
select n.nspname as schema,
       p.proname as function,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public')
order by n.nspname, p.proname;

-- Filtro útil por prefixos comuns
select n.nspname as schema, p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public')
  and p.proname ~ '(current_|is_|ensure_|safe_|bootstrap_|upsert_)'
order by p.proname;
```

## 8) Checagem rápida de colunas-chave

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('turmas','id'), ('turmas','teacher_id'), ('turmas','meeting_rules'),
    ('turma_members','turma_id'), ('turma_members','student_id'),
    ('sessions','id'), ('sessions','turma_id'), ('sessions','date'),
    ('attendance','session_id'), ('attendance','student_id'),
    ('teachers','id'), ('teachers','user_id')
  )
order by table_name, column_name;
```

---

## Via psql (opcional, Windows PowerShell)

Se tiver psql instalado localmente, você pode executar consultas pontuais assim (ajuste HOST/DB/USER/PWD):

```powershell
# Exemplo: listar policies
psql "host=<HOST> dbname=<DB> user=<USER> password=<PWD> sslmode=require" -c "select * from pg_policies where schemaname='public' order by tablename, policyname;"
```

## O que precisamos coletar para a decisão

- Policies completas de: `turmas`, `turma_members`, `sessions`, `attendance`.
- DDL (colunas/índices/FKs) dessas mesmas tabelas e de `teachers`/`students`.
- Definições das funções RPC usadas pelo app: `current_tenant_id`, `current_teacher_id`, `is_admin_or_owner`, `is_admin_current_tenant`, `is_admin_or_finance_read/write`, `is_admin_or_registry_read`, `get_tenant_settings`, `upsert_tenant_settings`, e outras que o editor listar.
- Triggers nessas tabelas (se houver) e views relacionadas.

Com esses artefatos em mãos, ajustamos o blueprint de granularidade de turmas à sua realidade sem suposições.

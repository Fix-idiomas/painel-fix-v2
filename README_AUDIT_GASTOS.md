# Auditoria de Despesas / Gastos (Inventário SQL)

Este README fornece um pacote de consultas para inspecionar completamente todas as estruturas do banco relacionadas a despesas ("gastos"). Execute em ordem (idealmente em uma sessão isolada) e copie os resultados para análise antes de qualquer migração de granularidade.

## Escopo pretendido
Tabelas alvo (nomes observados no código):
- expense_entries
- expense_templates
- expense_categories (opcional, se existir)

Se na base real os nomes diferirem (ex: `gastos`, `despesas`), primeiro descubra usando varredura.

---
## 1. Descoberta de tabelas por nome
```sql
-- Tabelas contendo possíveis padrões
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (
    table_name ILIKE '%expense%' OR
    table_name ILIKE '%gasto%' OR
    table_name ILIKE '%despesa%'
  )
ORDER BY table_name;
```

## 2. Colunas e tipos
```sql
-- Estrutura de cada tabela identificada
SELECT table_name, ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('expense_entries','expense_templates','expense_categories')
ORDER BY table_name, ordinal_position;
```

## 3. Chaves Primárias e Uniques
```sql
SELECT tc.table_name, tc.constraint_name, tc.constraint_type, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema='public'
  AND tc.table_name IN ('expense_entries','expense_templates','expense_categories')
  AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;
```

## 4. Foreign Keys
```sql
SELECT cl.relname AS table_name,
       con.conname AS constraint_name,
       pg_get_constraintdef(con.oid) AS constraint_def
FROM pg_constraint con
JOIN pg_class cl ON con.conrelid = cl.oid
JOIN pg_namespace nsp ON nsp.oid = cl.relnamespace
WHERE nsp.nspname='public'
  AND cl.relname IN ('expense_entries','expense_templates','expense_categories')
  AND con.contype='f'
ORDER BY cl.relname, con.conname;
```

## 5. Indexes
```sql
SELECT tablename AS table_name, indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND tablename IN ('expense_entries','expense_templates','expense_categories')
ORDER BY tablename, indexname;
```

## 6. Row Level Security ativo?
```sql
SELECT relname AS table_name, relrowsecurity AS rls_enabled, relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public'
  AND relname IN ('expense_entries','expense_templates','expense_categories');
```

## 7. Policies de RLS
```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('expense_entries','expense_templates','expense_categories')
ORDER BY tablename, policyname;
```

## 8. Triggers
```sql
SELECT event_object_table AS table_name,
       trigger_name,
       event_manipulation AS event,
       action_timing,
       action_statement
FROM information_schema.triggers
WHERE event_object_schema='public'
  AND event_object_table IN ('expense_entries','expense_templates','expense_categories')
ORDER BY event_object_table, trigger_name;
```

## 9. Funções/RPC que referenciam as tabelas
(Atenção: pode ser pesado — filtrar depois manualmente.)
```sql
SELECT n.nspname AS schema, p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND (
    pg_get_functiondef(p.oid) ILIKE '%expense_entries%' OR
    pg_get_functiondef(p.oid) ILIKE '%expense_templates%' OR
    pg_get_functiondef(p.oid) ILIKE '%expense_categories%'
  )
ORDER BY function_name;
```

Para inspecionar o corpo completo de uma função específica:
```sql
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname = '<NOME_FUNCAO>';
```

## 10. Contagem e amostras (sanidade)
```sql
SELECT 'expense_entries' AS table, count(*) AS rows FROM expense_entries UNION ALL
SELECT 'expense_templates', count(*) FROM expense_templates UNION ALL
SELECT 'expense_categories', count(*) FROM expense_categories;
```

Amostra limitada (não usar em ambiente com dados sensíveis se usuário sem permissão):
```sql
SELECT * FROM expense_entries LIMIT 20;
SELECT * FROM expense_templates LIMIT 20;
SELECT * FROM expense_categories LIMIT 20;
```

## 11. Distribuição por status (se existir coluna status em entries)
```sql
SELECT status, count(*)
FROM expense_entries
GROUP BY status
ORDER BY count(*) DESC;
```

## 12. Verificação de possíveis vazamentos via RLS (executar como usuário restrito)
```sql
-- Deve retornar 0 para usuário sem finance.read/write (apenas submit_expense planejado)
SELECT count(*) AS visible_expense_entries
FROM expense_entries;
```

Se retornar >0 para o usuário que não deveria ver, RLS está permissivo demais.

## 13. Custo de índices (estatísticas básicas)
```sql
-- Requer ANALYZE prévio
SELECT relname AS table_name, n_live_tup, n_dead_tup, relpages
FROM pg_stat_user_tables
WHERE relname IN ('expense_entries','expense_templates','expense_categories');
```

## 14. Colunas sensíveis (heurística)
```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('expense_entries','expense_templates','expense_categories')
  AND (column_name ILIKE '%amount%' OR column_name ILIKE '%valor%' OR column_name ILIKE '%paid%' OR column_name ILIKE '%status%')
ORDER BY table_name, column_name;
```

## 15. Policies que potencialmente concedem ampla leitura (qual contém TRUE direto)
```sql
SELECT tablename, policyname, qual
FROM pg_policies
WHERE tablename IN ('expense_entries','expense_templates','expense_categories')
  AND (qual ILIKE '%true%' OR qual ILIKE '% or %');
```

## 16. Dependências em views
```sql
SELECT DISTINCT v.viewname AS view_name, t.relname AS referenced_table
FROM pg_views v
JOIN pg_depend d ON d.refobjid = (SELECT oid FROM pg_class WHERE relname = v.viewname)
JOIN pg_class t ON d.objid = t.oid
WHERE v.schemaname='public'
  AND t.relname IN ('expense_entries','expense_templates','expense_categories')
ORDER BY v.viewname;
```

## 17. Grants (privilegios diretos fora do RLS)
```sql
SELECT table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema='public'
  AND table_name IN ('expense_entries','expense_templates','expense_categories')
ORDER BY table_name, grantee, privilege_type;
```

## 18. Sequence metadata (se PK for sequence)
```sql
SELECT relname AS sequence_name, last_value, start_value, increment_by
FROM pg_sequences
WHERE schemaname='public'
  AND relname ILIKE '%expense%';
```

## 19. Colunas sem índice usadas para filtro frequente (heurístico)
```sql
-- Ajustar após ver resultados reais. Primeiro mostrar colunas.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='expense_entries'
  AND column_name IN ('tenant_id','status','due_date','competence_month','cost_center')
EXCEPT
SELECT tablename, regexp_replace(indexdef, '.*\((.*)\).*', '\1') AS column_name
FROM pg_indexes
WHERE schemaname='public' AND tablename='expense_entries';
```

## 20. Funções utilitárias de tenant/role (para confirmar uso nas policies)
```sql
SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND (
    proname ILIKE '%current_tenant%' OR
    proname ILIKE '%is_admin%' OR
    proname ILIKE '%is_owner%' OR
    proname ILIKE '%current_role%'
  )
ORDER BY proname;
```

---
## Próximos passos após coletar
1. Validar se RLS realmente bloqueia SELECT para usuário que só terá `finance.submit_expense`.
2. Identificar necessidade de índices novos (tenant_id + status, competence_month).
3. Confirmar inexistência de trigger que auto-insere gastos avulsos (para evitar duplicidade com staging futura).
4. Mapear todas as funções que fazem INSERT em `expense_entries`.

---
## Permissão recomendada para usuário lançador
Não usar `finance.write` (abrange leitura e alterações amplas). Criar capacidade específica:
- `finance.submit_expense` (somente inserir em staging ou em fluxo controlado)

Se optar por tabela staging, RLS garante:
- INSERT permitido com `finance.submit_expense`.
- SELECT restrito (apenas próprias submissões ou nenhuma, conforme decisão).
- Nenhuma visibilidade de `expense_entries` ou KPIs.

Caso incapacidade de criar novo campo em `perms` agora: usar ACL separada `finance_submitters` e derivar em sessão.

---
## Referência curta de diferença
| Capability | Acesso | Operações |
|------------|--------|-----------|
| finance.read | Leitura completa de despesas e KPIs | SELECT em todas as tabelas de despesas |
| finance.write | CRUD completo + geração automática | INSERT/UPDATE/DELETE + funções geração |
| finance.submit_expense (novo) | Nenhuma leitura agregada (só staging opcional) | INSERT controlado (one-off) |

---
## Observação
Execute sempre os blocos em uma conta com privilégios de inspeção (admin/owner) e depois repita testes críticos (RLS, visibilidade) com a role mais restrita planejada para validar.

Fim.

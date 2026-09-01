# Banco de dados

Postgres no Supabase, com RLS habilitado em todas as tabelas multi-tenant. O modelo
de segurança está em [SECURITY.md](SECURITY.md); aqui está o **workflow** e a
referência.

## Fluxo de migrations

- Toda mudança de schema/RLS/RPC/trigger vira um arquivo datado em **`db/migrations/`**:
  `YYYYMMDD_descricao.sql`. É a **fonte da verdade** do schema.
- Idempotente quando possível (`create ... if not exists`, `WHERE col IS NULL` em
  backfills, etc.).
- **Ordem recomendada:**
  1. Escreva a migration.
  2. Aplique no banco (Supabase dashboard, ou MCP `apply_migration`).
  3. **Verifique** o efeito (query de conferência, ou script em `db/verify/`).
  4. **Commite** a migration. Não deixe o banco à frente do repo.
- Algumas migrations têm notas em `docs/migrations/`.
- Se uma feature depende de migration nova, aplique-a na **prod antes** do deploy da
  rota que a usa.

### Cuidados

- **`execute_sql` (MCP) é autocommit** e `RAISE` **não** desfaz DDL. Para testar com
  rollback garantido, use um único bloco `DO $$ ... $$` que faz o trabalho, asserta as
  invariantes e no fim dá `RAISE EXCEPTION 'ROLLBACK ok'` (aborta e desfaz tudo).
- **Backfill** deve ser genérico e idempotente; não hardcode IDs gerados.
- Ao mexer em `SECURITY DEFINER`, releia o footgun do `row_security` em
  [SECURITY.md](SECURITY.md).

## Scripts de verificação (`db/verify/`)

Scripts SQL **read-only** que travam invariantes críticas — falham com
`RAISE EXCEPTION` se a regressão voltar. Rodáveis em qualquer ambiente (Supabase SQL
editor, psql, CI).

- `bootstrap_tenant_and_admin.verify.sql` — garante que o onboarding grava
  `owner_user_id` + `role='admin'` (e não voltou a usar `role='owner'`), e que o
  constraint/`is_owner` seguem corretos.

```bash
psql "$DATABASE_URL" -f db/verify/bootstrap_tenant_and_admin.verify.sql
```

Adicione um verify novo sempre que corrigir um bug de banco que poderia silenciosamente
regredir.

## RPCs centrais

| RPC | Papel |
|---|---|
| `current_tenant_id()` | tenant do usuário atual (base de toda policy) |
| `current_teacher_id()` | vincula login ↔ registro de professor (escopo por professor) |
| `is_owner_current_tenant()` | titularidade: `owner_user_id` **ou** claim admin |
| `can_teacher_see_turma(id)` / `can_teacher_see_student(id)` | escopo por professor (SELECT) |
| `is_admin_or_finance_read/write`, `is_admin_or_registry_read/write`, `is_admin_or_owner` | autorização por área |
| `tenant_access_level()` / `tenant_can_read()` / `tenant_can_write()` | entitlement/paywall (RESTRICTIVE) |
| `bootstrap_tenant_and_admin(name, display)` | cria tenant (grava `owner_user_id`) + claim `role='admin'` + trial |
| `get_tenant_settings()` / `upsert_tenant_settings(...)` | settings do tenant |
| `claim_checkout(tenant)` | claim atômico anti-dupla-assinatura (billing) |
| `ensure_other_revenues_for_month(tenant, ym)` | outras receitas recorrentes |

> Muitas dessas são `SECURITY DEFINER`. Ver [SECURITY.md](SECURITY.md).

## Tabelas principais (por domínio)

- **Tenancy/auth:** `tenants` (`owner_user_id`), `user_claims` (`role` ∈ {admin,user}),
  `tenant_settings`, `subscriptions`.
- **Cadastro:** `students`, `teachers`, `payers`, `turmas`, `turma_members`.
- **Agenda:** `sessions` (`date timestamptz`), `attendance`.
- **Financeiro:** `payments` (mensalidades; `competence_month`, `due_date`,
  `status`), `expense_entries`, `expense_templates`, `other_revenues`.
- **IA:** `student_ai_insights` (cache por hash SHA-256).
- **Operacional:** `cron_runs` (auditoria de execução dos crons; service-role only).

## Crons

Definidos em `vercel.json`, protegidos por `Authorization: Bearer ${CRON_SECRET}`,
rodando com service-role (cross-tenant). Tabela completa em
[ARCHITECTURE.md](ARCHITECTURE.md#crons-verceljson). Destaque:

- **`monthly-previa`** (diário) gera mensalidades/gastos do mês de forma
  **idempotente** — a existência por mês considera **qualquer** status (inclusive
  `canceled`), porque o índice único é parcial (`WHERE status <> 'canceled'`); senão o
  job diário "ressuscitaria" cancelamentos. Ver `src/lib/server/monthlyGeneration.ts`
  e seus testes.

## Storage

- Bucket de fotos de aluno (`students_photos`), com policies próprias. Upload converte
  para WebP no cliente (PDF → primeira página via `pdfjs-dist`). Ver
  `README_FOTOS_ALUNOS.md`.

# Segurança e modelo multi-tenant (RLS)

Como o isolamento entre escolas (tenants) e as permissões funcionam. **Leia antes de
mexer em qualquer policy, RPC de permissão ou fluxo de auth.** As migrations em
`db/migrations/` são a fonte da verdade; este doc é o mapa.

## Princípios

1. **Isolamento por tenant é responsabilidade do banco, não da UI.** Toda tabela
   multi-tenant tem `tenant_id uuid not null default current_tenant_id()` e policies
   que incluem `tenant_id = current_tenant_id()`. O frontend **nunca** envia
   `tenant_id`.
2. **O browser usa sempre a anon key** (RLS-bound). A **service-role** (que bypassa
   RLS) é **server-only, nunca em código de cliente** — usada em `api/admin/*`,
   `api/cron/*`, `api/billing/*` e `api/webhooks/asaas`, onde o escopo por tenant vira
   responsabilidade explícita do código.
3. **Permissão vem do banco.** A sessão (`useSession`) é só conveniência de UI; a
   autorização real é RLS + RPCs.

## Identidade e contexto

- `current_tenant_id()` — tenant do usuário atual (via claim/JWT). Base de toda policy.
- `current_teacher_id()` — vincula o login ao registro de professor (para escopo por
  professor).
- `user_claims` — vincula `user_id` ↔ `tenant_id` ↔ `role`. **`role` só aceita
  `admin` ou `user`** (check constraint `user_claims_role_check`). "owner" **não** é
  role de claim — titularidade é outra coisa (abaixo).

## Papéis e permissões

- **`owner` / `admin`** — acesso total ao tenant.
- **`member` / `user`** — granular: `finance` e `classes`, cada um `read`/`write`,
  mais `*.write_own` (só o que é do próprio professor).
- A autorização de servidor é feita por RPCs, ex.: `is_admin_or_finance_read/write`,
  `is_admin_or_registry_read/write`, `is_admin_or_owner`. Helpers puros de UI
  (`src/lib/perms.ts`: `isOwner`, `hasPerm`, `canEditTurma`, `canEditAluno`) apenas
  refletem isso para mostrar/esconder controles — **não** são a fonte de autorização.

## Titularidade (owner) — first-class

- O dono do tenant é **`tenants.owner_user_id`**.
- `is_owner_current_tenant()` (`SECURITY DEFINER`) reconhece o dono por **duas** vias
  (OR), para tolerar legados:
  1. `owner_user_id = auth.uid()`, **ou**
  2. o usuário tem claim `role='admin'` no tenant.
- O owner faz **bypass** e enxerga/edita tudo do seu tenant (turmas, alunos,
  professores, aulas, financeiro).
- Ver `db/migrations/20260706_owner_first_class.sql`. Tenants legados sem
  `owner_user_id` foram preenchidos por
  `db/migrations/20260708_backfill_tenant_owner_user_id.sql` (dono = admin mais antigo).

## Escopo por professor (cadastro/agenda)

Um `member` professor vê **apenas** suas turmas e os alunos dessas turmas; `admin`/
`owner` veem tudo. Implementado por funções `SECURITY DEFINER` usadas nas policies de
SELECT:

- `can_teacher_see_turma(turma_id)` e `can_teacher_see_student(student_id)`.
- Aplicado em `turmas`, `students`, `sessions`, `attendance`. Ver
  `db/migrations/20260702_scope_turmas_students_reads.sql`,
  `20260706_scope_sessions_reads.sql`, `20260706_scope_attendance.sql`,
  `20260706_scope_writes.sql`.

## PERMISSIVE vs RESTRICTIVE

- **PERMISSIVE** (padrão) combinam com **OR** — qualquer policy que passe concede
  acesso. É como as policies de tenant/escopo funcionam.
- **RESTRICTIVE** combinam com **AND** — todas precisam passar. Usadas para
  **entitlement/paywall**: `tenant_access_level()` / `tenant_can_read()` /
  `tenant_can_write()` são aplicadas como RESTRICTIVE nas tabelas de negócio, então
  uma assinatura expirada bloqueia escrita mesmo com a policy de tenant passando. Ver
  os PRDs em `docs/prd/` e a migration `20260621_entitlement_enforcement.sql`.

## ⚠️ Footguns de `SECURITY DEFINER`

Funções `SECURITY DEFINER` rodam como o **dono** da função e **bypassam RLS**. Isso é
necessário (para checar permissão sem recursão de policy), mas perigoso:

- **Desligar RLS dentro da função:** use a cláusula de cabeçalho
  `SET row_security TO 'off'` (escopo da função, restaurado automaticamente ao
  retornar). **NUNCA** use `perform set_config('row_security','off', true)` no corpo:
  o `true` é escopo de **transação**, então o RLS fica desligado para o resto da
  transação inteira → **vazamento entre tenants**. Bug real corrigido em
  `db/migrations/20260706_fix_row_security_leak.sql`.
- Mantenha essas funções **mínimas** e só para decisão de permissão. Nunca as use para
  retornar dados de negócio "burlando" a RLS.

## Onboarding e bootstrap

`bootstrap_tenant_and_admin(p_tenant_name, p_display_name)` (`SECURITY DEFINER`):

- Cria `public.tenants` **gravando `owner_user_id`** (titularidade).
- Insere o claim em `public.user_claims` com **`role='admin'`** (não `owner` — o check
  constraint rejeitaria).
- Insere o **trial** de assinatura inline (na própria função). Um trigger
  (`trg_seed_tenant_settings`) semeia `tenant_settings`.

Verificação read-only da invariante (falha se a regressão voltar — `role='owner'` ou
`owner_user_id` ausente): `db/verify/bootstrap_tenant_and_admin.verify.sql`.

## Como validar RLS (sem Postgres de teste)

O harness de teste (Vitest + mock) **não** modela RLS. Valide policies simulando um
papel no SQL, dentro de uma transação com rollback:

```sql
begin;
  set local role authenticated;
  select set_config(
    'request.jwt.claims',
    '{"sub":"<user_uuid>","tenant_id":"<tenant_uuid>","role":"authenticated"}',
    true
  );
  -- rode a query que a policy deveria permitir/negar e confira o resultado
  select count(*) from public.turmas;
rollback;
```

Compare contagens entre um professor (escopo reduzido), um admin e o owner. Foi assim
que o escopo por professor e a titularidade foram validados nesta base.

## Fronteiras de service-role

- Server-only: `api/admin/*`, `api/cron/*`, `api/billing/*`, `api/webhooks/asaas`.
  **Nunca** em código de cliente.
- Ao usar service-role, o **escopo por tenant é do código** — filtre por `tenant_id`
  explicitamente em toda query/insert (ex.: `src/lib/server/monthlyGeneration.ts`).
- `GET /billing/status` lê `subscriptions` via service-role de propósito (anti-deadlock
  vs. policies RESTRICTIVE), *gated* por `is_admin_or_owner`.

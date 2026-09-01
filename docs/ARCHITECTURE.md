# Arquitetura

Visão atual e autoritativa da arquitetura do DASH. Substitui o antigo
`README_ARQUITETURA.md`.

## Stack

- **Next.js 15** (App Router) + **React 19**
- **Supabase** — Auth, Postgres (com RLS), Storage
- **TailwindCSS v4** (`@tailwindcss/postcss`)
- **TypeScript** com `strict: false`, `allowJs: true` — `.ts/.tsx` e `.js/.jsx`
  convivem. Alias `@/*` → `src/*`.
- **Vitest** (ambiente node, Supabase mockado)
- **Anthropic SDK** (insights de IA), **Mailgun** (e-mail), **Asaas** (assinatura),
  **pdfjs-dist** (PDF→imagem no upload de foto)
- Deploy na **Vercel**; crons em `vercel.json`.

## Glossário de domínio

Termos pt-BR usados em todo o código e nestes docs:

| Termo | Significado |
|---|---|
| **tenant** | uma escola (conta isolada). Todo dado é escopado por `tenant_id`. |
| **turma** | grupo/classe de alunos que se encontra segundo `meeting_rules`. |
| **aluno / pagador** | estudante / responsável financeiro (quem paga a mensalidade). |
| **mensalidade** | cobrança mensal do aluno (`payments`). |
| **competência** | mês contábil de um lançamento (`competence_month`), distinto do vencimento (`due_date`). |
| **prévia** | geração dos lançamentos do mês (cron `monthly-previa`). |
| **repasse** | pagamento devido ao professor (`sumTeacherPayoutByMonth`); entra como custo. |
| **owner / titular** | dono do tenant (`tenants.owner_user_id`); acesso total. |
| **claim** | vínculo usuário↔tenant↔papel em `user_claims` (`role` ∈ {admin, user}). |
| **entitlement** | direito de acesso conforme a assinatura (paywall via policies RESTRICTIVE). |

## Camadas

O dado flui em uma direção, **sem pular camadas** a partir da UI:

```
┌─────────────────────────────────────────────────────────────┐
│  UI (src/app/**, .jsx "use client")                          │
│  páginas + componentes; hooks de sessão (useSession)         │
└───────────────┬─────────────────────────────────────────────┘
                │ chama
┌───────────────▼─────────────────────────────────────────────┐
│  financeGateway (src/lib/financeGateway.ts)                  │
│  adapter que a UI chama; normalização leve (status,          │
│  cost_center, shape { rows, kpis }). Sem service-role.       │
└───────────────┬─────────────────────────────────────────────┘
                │ delega (via barrel supabaseGateway.ts)
┌───────────────▼─────────────────────────────────────────────┐
│  Domain gateways (src/lib/gateways/*.ts)                     │
│  studentGateway, teacherGateway, payerGateway, turmaGateway, │
│  paymentGateway, expenseGateway, otherRevenueGateway,        │
│  financeKpisGateway, settingsGateway  (+ helpers.ts)         │
│  queries cruas via cliente ANON. Nunca engolem erro.         │
└───────────────┬─────────────────────────────────────────────┘
                │ usa
┌───────────────▼─────────────────────────────────────────────┐
│  supabaseClient (anon, RLS-bound)  →  Supabase Postgres/RLS  │
└─────────────────────────────────────────────────────────────┘
```

- **`src/lib/supabaseClient.ts`** — único cliente browser/anon. Lança no import se
  faltarem URL/anon key. `getClaims()` decodifica o JWT (debug).
- **`src/lib/financeGateway.ts`** — a fachada que a UI chama. Hoje delega via o
  *barrel* `supabaseGateway` (`financeGateway → supabaseGateway → domain gateways`) e
  aplica normalização leve. **Sem service-role, sem bypass de RLS.**
- **`src/lib/gateways/*.ts`** — um gateway por domínio. Utilidades compartilhadas em
  `gateways/helpers.ts` (`mapErr`, helpers de data, `getTenantId`, recorrência).
- **`src/lib/supabaseGateway.ts`** — *barrel* fino (spread-merge) que junta os domain
  gateways por compatibilidade. **Código novo importa o domain gateway direto**, não o
  barrel.

> **Por que assim:** a UI nunca fala com o Supabase direto nem manipula `tenant_id`.
> A segurança real mora no banco (RLS + RPC); os gateways só transportam. Ver
> [SECURITY.md](SECURITY.md) e [BEST_PRACTICES.md](BEST_PRACTICES.md).

### Rotas de servidor (não usam o cliente anon do browser)

- **`src/app/api/**`** — route handlers. Usam clientes server-side
  (`@supabase/auth-helpers-nextjs`), **rechecam** tenant + permissão via RPC e
  retornam JSON.
- **Rotas admin** (`api/admin/*`) e **crons** (`api/cron/*`) usam a **service-role
  key** (server-only) para operar cross-tenant. Crons exigem
  `Authorization: Bearer ${CRON_SECRET}`.
- Lógica server-only pesada mora em `src/lib/server/*` (ex.: `monthlyGeneration.ts`,
  a geração multi-tenant de mensalidades/gastos usada pelo cron).

## Estrutura de pastas

```
src/
  app/
    (auth)/            login, signup
    (app)/             app logado (ver "Rotas" abaixo)
    api/               route handlers (admin, ai, billing, cron, webhooks, send-mail)
    onboarding/        criação do tenant no 1º login
    debug-jwt/ ...     rotas de debug (404 em produção)
  components/          AppShell, Sidebar, Guard, Modal, AppModal, Kpi, Tabs,
                       BillingBanner, SubscriptionGuard, UserMenu, WeekGrid, ...
  contexts/            SessionContext.jsx (useSession)
  lib/
    gateways/          domain gateways + helpers + __tests__
    finance/           utils puros de finanças (dates, status, helpers)
    ai/                anthropic.ts (insights)
    server/            código server-only (monthlyGeneration)
    __tests__/         testes de libs puras
    supabaseClient.ts, financeGateway.ts, perms.ts, navConfig.ts,
    sessionDisplay.ts, revenueKpis.ts, agendaEvents.ts, asaas.ts,
    mailgun.ts, subscription.js, entitlement.js, ...
  types/               index.ts (tipos compartilhados)
db/
  migrations/          migrations SQL datadas (fonte da verdade do schema)
  verify/              scripts SQL read-only de verificação (ex.: onboarding)
docs/                  esta documentação
```

## Rotas

App Router sob `src/app`:

- **`(auth)/`** — `login`, `signup`. (`reset-password` vive em `(app)`.)
- **`(app)/`** — app principal: `recepcao` (dashboard pós-login), `painel`,
  `alunos` (+ `[id]/evolucao`), `professores`, `turmas` (+ `[id]`), `pagadores`,
  `agenda`, `financeiro` (`mensalidades`, `gastos`, `categorias`,
  `outras-receitas`), `relatorios` (`assiduidade`, `inadimplencia`),
  `configuracoes`, `conta`, `cadastro`, `assinatura`, `accept-invite`.
  **Legado:** `recepcao-old` e `/gastos` (este deve redirecionar para
  `/financeiro/gastos`).
- **Top-level** (fora de `(auth)`/`(app)`): `onboarding` (`src/app/onboarding`) e as
  rotas de debug (`debug-jwt`, `debug-payments`, `dev/storage`).
- **`api/`** — `ai/student-insights`, `admin/{create-user,update-user-perms}`,
  `billing/{subscribe,cancel,status}`, `webhooks/asaas`, `send-mail`,
  `cron/{dunning-reminders,monthly-previa,expire-subscriptions,
  subscription-dunning,reconcile-subscriptions}`.

### Middleware

`src/middleware.ts` protege rotas por cookie de sessão Supabase:
`/` → `/recepcao` (autenticado) ou `/login`; rota privada sem sessão →
`/login?next=…`; `/login`+`/signup` autenticado → `/recepcao`. Rotas de debug
(`/debug-jwt`, `/debug-payments`, `/debug/`, `/dev/`) retornam 404 em produção.
`/api` e assets estáticos ficam fora do matcher.

## Sessão e permissões

- **`src/contexts/SessionContext.jsx`** (`useSession`) é a fonte da verdade na UI,
  **hidratada do banco**: `current_tenant_id()`, a linha de `user_claims`,
  `current_teacher_id()` e a checagem de owner. localStorage guarda **só** prefs de
  UI (ex.: `tenantName`) — nunca papéis/permissões.
- **`src/lib/perms.ts`** — helpers puros: `isOwner`, `hasPerm(session, "area.key")`,
  `canEditTurma`, `canEditAluno` (owner faz bypass; senão checa `*.write_own` contra
  o `teacherId`).
- **`src/lib/navConfig.ts`** — `NAV_ITEMS` + `getVisibleNav({ isAdmin, perms })`
  controlam a visibilidade da sidebar por `requireAdmin`/`perm`.
- **Papéis:** `owner`/`admin` (acesso total) vs `member` (granular
  `finance`/`classes`, read/write). A autorização **real** é no banco, via RPCs
  (`is_admin_or_finance_read/write`, `is_admin_or_registry_read/write`, etc.).

> ⚠️ **Regra de ouro do auth-lock:** nunca chame `supabase.auth.*` **dentro** de um
> callback de `onAuthStateChange` — causa deadlock no `TOKEN_REFRESHED`. Sempre
> adie com `setTimeout(…, 0)`. Detalhes em [BEST_PRACTICES.md](BEST_PRACTICES.md#o-auth-lock).

### Onboarding

Signup cria o usuário no Supabase Auth. No 1º login, se `current_tenant_id()` for
`NULL`, o app vai para `/onboarding`, que chama
`bootstrap_tenant_and_admin(p_tenant_name, p_display_name)` — cria `public.tenants`
(gravando `owner_user_id`), vincula o usuário em `public.user_claims` com
`role='admin'`, insere o **trial** de assinatura (inline na própria função), e um
trigger (`trg_seed_tenant_settings`) semeia `public.tenant_settings`. Ver
[SECURITY.md](SECURITY.md) e `db/verify/bootstrap_tenant_and_admin.verify.sql`.

## Módulos principais

- **Cadastro** — `students`, `teachers`, `turmas`, `payers`. Escopo por tenant; leitura
  de turmas/alunos com **escopo por professor** (professor vê só suas turmas + alunos
  delas; admin/owner veem tudo). Ver [SECURITY.md](SECURITY.md).
- **Financeiro**
  - *Mensalidades* (`payments`): `status = pending|paid|canceled`; competência por
    `competence_month`, vencimento por `due_date`. KPIs combinados (mensalidade +
    outras receitas) em `financeKpisGateway.getCombinedRevenueKpis` → shape
    **`{ total, received, upcoming, overdue }`** (chaves em inglês; leitura única via
    `src/lib/revenueKpis.ts`).
  - *Despesas* (`expense_entries` + `expense_templates` recorrentes) e *Outras
    receitas* (`other_revenues`).
  - *Repasse de professores*: `sumTeacherPayoutByMonth`; entra como custo em
    `saldo_operacional` e na "Líquida" dos relatórios.
- **Agenda / presença** — `sessions`, `attendance`, `turma_members`. Datas de sessão
  são `timestamptz`; a escola opera em `America/Sao_Paulo`. Geração de sessões a
  partir das `meeting_rules` da turma usa o **horário da regra** (senão a aula nascia
  00:00). Ver `turmaGateway.ensureSessionsFromRules` e `src/lib/agendaEvents.ts`.
- **Relatórios** — `assiduidade`, `inadimplencia`, e o gráfico "Receita por mês"
  (`/relatorios`).
- **IA** — `src/lib/ai/anthropic.ts`, default `claude-haiku-4-5`, saída JSON estrita,
  cache em `student_ai_insights` por hash SHA-256 do payload (`force_refresh` ignora
  cache).

## Billing (assinatura Asaas)

- **`src/lib/asaas.ts`** — cliente (cartão via checkout hospedado; **Pix inline** via
  `getPaymentPixQrCode`). Webhook em `api/webhooks/asaas`; rotas
  `api/billing/{subscribe,cancel,status}`.
- **UI:** `/assinatura` (paywall + assinar) e aba "Plano e cobrança" em `/conta`.
- **Entitlement no banco (C1):** `tenant_access_level()` / `tenant_can_read()` /
  `tenant_can_write()` aplicadas como policies **RESTRICTIVE** nas tabelas de negócio.
- `GET /billing/status` lê `subscriptions` via **service role** (anti-deadlock vs.
  policies RESTRICTIVE), *gated* por `is_admin_or_owner`. O status/datas a UI lê do
  **claim** do JWT (`useSubscription`/`readSubscriptionClaim`), **nunca** da tabela
  direto.
- **Crons:** `expire-subscriptions` (backstop), `subscription-dunning`,
  `reconcile-subscriptions`. Detalhes de billing: `docs/prd/`.

## Convenções de fuso horário e dinheiro

- **Dinheiro** é BRL.
- **Datas** de negócio são strings `YYYY-MM-DD` com helpers de São Paulo em
  `gateways/helpers.ts` (`tzToday`, `monthStartOf`, `dueDateFor`, `toIsoTz`).
  ⚠️ `toIsoTz` usa a **hora local do runtime** (`new Date(...)`), que equivale a SP
  só porque o navegador/runtime está em SP — em teste, fixe
  `process.env.TZ='America/Sao_Paulo'`. `America/Sao_Paulo` é UTC-3 sem horário de
  verão (desde 2019). Ver o alerta de fuso em
  [BEST_PRACTICES.md](BEST_PRACTICES.md#fuso-horário).

## Crons (vercel.json)

| Cron | Schedule (UTC) | O quê |
|---|---|---|
| `dunning-reminders` | `0 12 * * *` | lembretes de vencimento |
| `monthly-previa` | `13 6 * * *` (diário) | gera mensalidades/gastos do mês (idempotente) |
| `expire-subscriptions` | `0 6 * * *` | expira assinaturas (backstop) |
| `subscription-dunning` | `0 13 * * *` | dunning de assinatura |
| `reconcile-subscriptions` | `30 6 * * *` | reconcilia assinaturas órfãs na Asaas |

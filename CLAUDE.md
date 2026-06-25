# CLAUDE.md

Guidance for working in this repository. Read this before making changes.

## What this is

**Painel Fix v2 (DASH)** — a multi-tenant web app for language-school management (Fix-Idiomas). It handles enrollment/registry (alunos, professores, turmas, pagadores), finance (mensalidades, despesas, outras receitas), class scheduling/attendance (agenda), reporting, and AI-generated pedagogical insights per student.

UI text and domain language are **Portuguese (pt-BR)**. Keep user-facing strings, comments, and error messages in Portuguese to match the existing code.

## Stack

- **Next.js 15** (App Router) + **React 19**
- **Supabase** — Auth, Postgres (with RLS), Storage
- **TailwindCSS v4** (`@tailwindcss/postcss`)
- **TypeScript** (`strict: false`, `allowJs: true` — `.ts`/`.tsx` and `.js`/`.jsx` coexist)
- **Vitest** (node environment) for tests
- **Anthropic SDK** (`@anthropic-ai/sdk`) for AI insights
- **Mailgun** for transactional/dunning email; **pdfjs-dist** for PDF→image in photo upload
- Deploys to **Vercel** (crons defined in `vercel.json`)

Node 20+. Path alias `@/*` → `src/*` (configured in `tsconfig.json` and `vitest.config.js`).

## Commands

```bash
npm ci              # install
npm run dev         # dev server at http://localhost:3000
npm run build       # production build
npm run start       # serve production build
npm run lint        # eslint
npm test            # vitest run (one-shot)
npm run test:watch  # vitest watch
```

## Environment

Create `.env.local` (never commit — `.env*` is gitignored):

```
NEXT_PUBLIC_SUPABASE_URL=...      # client + server
NEXT_PUBLIC_SUPABASE_ANON_KEY=... # client + server (anon, RLS-bound)
SUPABASE_SERVICE_ROLE_KEY=...     # SERVER ONLY — admin/create-user and cron routes
ANTHROPIC_API_KEY=...             # server only — AI insights
MAILGUN_API_KEY=...               # server only
MAILGUN_DOMAIN=...
MAILGUN_FROM=...
CRON_SECRET=...                   # Bearer token guarding /api/cron/* routes
ASAAS_API_KEY=...                 # server only — Asaas (assinaturas SaaS). Contém '$' → use ASPAS no .env.local
ASAAS_WEBHOOK_TOKEN=...           # server only — valida o header asaas-access-token do webhook
ASAAS_BASE_URL=...                # https://api-sandbox.asaas.com/v3 (sandbox) | https://api.asaas.com/v3 (prod)
PLAN_MONTHLY_BRL=...              # server only — valor mensal do plano (placeholder até definição)
APP_URL=...                       # opcional — base p/ links nos e-mails de dunning
```

> **Billing/Asaas (PRD-2/3):** `src/lib/asaas.ts` (cliente, padrão `mailgun.ts`; cartão via checkout hospedado e **Pix inline** via `getPaymentPixQrCode`), webhook em `src/app/api/webhooks/asaas`, rotas `src/app/api/billing/{subscribe,cancel,status}`. UI: `/assinatura` (paywall + assinar) e aba "Plano e cobrança" em `/conta`. A rota `GET /billing/status` lê `subscriptions` via **service role** (anti-deadlock vs. policies RESTRICTIVE C1, gated por `is_admin_or_owner`); o status/datas a UI lê do **claim** JWT (`useSubscription`/`readSubscriptionClaim`), nunca da tabela direto. Entitlement no banco (C1) via `tenant_access_level()`/`tenant_can_read()`/`tenant_can_write()` aplicadas como policies RESTRICTIVE nas tabelas de negócio. Crons: `expire-subscriptions` (backstop) e `subscription-dunning`.

## Architecture & layered data access

Data flows **page → financeGateway → supabaseGateway → Supabase (anon client)**. Do not skip layers from UI code.

- **`src/lib/supabaseClient.ts`** — single browser/anon Supabase client. Throws at import if URL/anon key are missing. `getClaims()` decodes the JWT for debugging.
- **`src/lib/gateways/*`** — domain gateways (`studentGateway`, `teacherGateway`, `payerGateway`, `turmaGateway`, `paymentGateway`, `expenseGateway`, `otherRevenueGateway`, `financeKpisGateway`, `settingsGateway`). Each runs raw queries via the anon client. Shared utilities live in `gateways/helpers.ts` (error mapping `mapErr`, date helpers, `getTenantId`, recurrence logic).
- **`src/lib/supabaseGateway.ts`** — thin barrel that merges all domain gateways into one object for backwards compatibility. **New code should import the domain gateway directly**, not the barrel.
- **`src/lib/financeGateway.ts`** — the adapter the UI calls. Reexports gateway calls, applies light normalization (status, `cost_center` uppercasing, default KPI shape `{ rows, kpis }`). No service-role, no RLS bypass.

### Hard security rules (non-negotiable)
- **Never send `tenant_id` from the frontend.** Every multi-tenant table has `tenant_id uuid not null default current_tenant_id()`; the DB fills it. Policies always include `tenant_id = current_tenant_id()`.
- **Browser always uses the anon key.** Service-role key is server-only (admin routes and crons).
- **Permissions come from the DB (RLS + RPC), never from the session object.** The session carries only minimal/UI data.
- **Gateways never swallow errors** — if RLS denies, the UI receives the raw error/empty, not a "corrected" result.
- No duplicate routes/pages (avoids double render). Keep hooks stable (top-level, unconditional).

## Auth, session & permissions

- **`src/middleware.ts`** protects routes via Supabase session cookies: `/` → `/recepcao` (auth) or `/login`; private routes without a session → `/login?next=…`; `/login`+`/signup` while authed → `/recepcao`. Dev-only routes (`/debug-jwt`, `/debug-payments`, `/debug/`, `/dev/`) return 404 in production. `/api` and static assets are excluded from the matcher.
- **`src/contexts/SessionContext.jsx`** (`useSession`) is the source of truth in the UI, hydrated **from the DB**: `current_tenant_id()`, the `user_claims` row, `current_teacher_id()`, owner check. localStorage stores only UI prefs (e.g. `tenantName`) — never roles/perms. `switchRole` is a dev-only no-op in production.
- **`src/lib/perms.ts`** — pure helpers: `isOwner`, `hasPerm(session, "area.key")`, `canEditTurma`, `canEditAluno` (owner bypasses; otherwise checks `*.write_own` against `teacherId`).
- **`src/lib/navConfig.ts`** — `NAV_ITEMS` + `getVisibleNav({ isAdmin, perms })` drives sidebar visibility by `requireAdmin`/`perm: { area, action }`.
- Roles: `owner` / `admin` (full perms) vs `member` (granular `finance`/`classes` read/write). Server-side, real authorization is enforced by DB RPCs like `is_admin_or_finance_read/write`, `is_admin_or_registry_read/write`.

### Onboarding flow
Signup creates the Supabase Auth user. On first login, if `current_tenant_id()` is `NULL`, the app routes to `/onboarding`, which calls `bootstrap_tenant_and_admin(p_tenant_name, p_display_name)` — creating `public.tenants`, linking the user in `public.user_claims` (admin), and a trigger seeds `public.tenant_settings`.

## Routes

App Router under `src/app`:
- **`(auth)/`** — `login`, `signup` (+ `reset-password` lives under `(app)`)
- **`(app)/`** — main app: `recepcao` (post-login dashboard), `painel`, `alunos` (+ `[id]/evolucao`), `professores`, `turmas` (+ `[id]`), `pagadores`, `agenda`, `financeiro` (`mensalidades`, `gastos`, `categorias`, `outras-receitas`), `relatorios` (`assiduidade`, `inadimplencia`), `configuracoes`, `conta`, `cadastro`, `onboarding`, etc. `recepcao-old` and `gastos` are legacy (`/gastos` is slated to redirect to `/financeiro/gastos`).
- **`api/`** — `ai/student-insights`, `admin/create-user`, `admin/update-user-perms`, `send-mail`, `cron/dunning-reminders`, `cron/monthly-previa`.

API routes use `createRouteHandlerClient`/server clients (not the browser singleton), re-check tenant + permission via RPC, and return JSON. Cron routes require `Authorization: Bearer ${CRON_SECRET}` and use the service-role key to scan all tenants server-to-server. Crons are scheduled in `vercel.json` (`dunning-reminders` daily 12:00, `monthly-previa` 06:13 on the 1st).

## Conventions

- Components are `.jsx` (`src/components/*`: `AppShell`, `Sidebar`, `Guard`, `Modal`, `Kpi`, etc.); libs and API routes are mostly `.ts`. Match the file type already in use for the area you touch.
- Money is BRL; dates are handled as `YYYY-MM-DD` strings with São Paulo timezone helpers (`tzToday`, `monthStartOf`, `dueDateFor` in `gateways/helpers.ts`). Note: month-criterion for expenses (`due_date` vs `competence_month`) is still being unified — check `README_ARQUITETURA.md` §6 before assuming.
- AI insights (`src/lib/ai/anthropic.ts`) default to `claude-haiku-4-5`, expect strict JSON output, and are cached in `student_ai_insights` keyed by a SHA-256 hash of the input payload (`force_refresh` bypasses cache).

## Database

- Migrations are versioned in **`db/migrations/`** (dated SQL files); some have matching notes in `docs/migrations/`. Keep DB changes here, idempotent where possible. Recommended path: apply in the Supabase dashboard, then commit.
- Central RPCs: `current_tenant_id`, `current_teacher_id`, `get_tenant_settings`, `upsert_tenant_settings`, `bootstrap_tenant_and_admin`, and the `is_admin_or_*` permission functions. RLS must be enabled with proper grants in production.

## Tests

Vitest with mocked Supabase. Gateway tests live in `src/lib/gateways/__tests__/` (per-gateway + `barrel.test.ts`) using `supabaseMock.ts`; other unit tests like `src/lib/__tests__/agendaEvents.test.ts`. Run `npm test` before submitting changes that touch gateways or finance logic.

## Further reading (repo docs)

- `README.md` — setup, auth/onboarding, photo storage, troubleshooting
- `README_ARQUITETURA.md` — layered architecture, routes, security rules, open items
- `README_INTEGRACOES.md`, `README_AUDIT_GASTOS.md`, `README_SUPABASE_AUDIT.md`, `README_FOTOS_ALUNOS.md`, `README_UI_PLAN.md` — deeper dives per area

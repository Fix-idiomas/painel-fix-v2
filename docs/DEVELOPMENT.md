# Desenvolvimento — setup e workflow

Como rodar, testar e entregar. Se algo aqui divergir do comportamento real,
corrija este arquivo.

## Pré-requisitos

- **Node.js 20+** (LTS)
- Git
- Acesso a um projeto **Supabase**:
  - Peça as credenciais do **projeto de desenvolvimento compartilhado** ao time
    (caminho recomendado — já vem com schema e dados), **ou**
  - crie um projeto Supabase próprio e provisione o schema do zero (ver
    [Banco do zero](#banco-do-zero-primeiro-setup)).
  - As chaves ficam no dashboard do Supabase em **Project Settings → API**
    (`URL`, `anon key`, `service_role key`).

## Variáveis de ambiente

Crie `.env.local` na raiz (**nunca** commite — `.env*` é gitignored):

```bash
# Cliente + servidor (anon, RLS-bound)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

# SERVER-ONLY — rotas admin/create-user e crons
SUPABASE_SERVICE_ROLE_KEY=...

# IA (server-only)
ANTHROPIC_API_KEY=...

# E-mail (server-only)
MAILGUN_API_KEY=...
MAILGUN_DOMAIN=...
MAILGUN_FROM=...

# Crons (Bearer que protege /api/cron/*)
CRON_SECRET=...

# Billing / Asaas (server-only)
ASAAS_API_KEY=...            # contém '$' → use ASPAS no .env.local
ASAAS_WEBHOOK_TOKEN=...      # valida o header asaas-access-token do webhook
ASAAS_BASE_URL=...           # sandbox: https://api-sandbox.asaas.com/v3 | prod: https://api.asaas.com/v3
PLAN_MONTHLY_BRL=...         # valor mensal do plano

# Opcional
APP_URL=...                  # base p/ links nos e-mails de dunning
```

> Regra: chaves `NEXT_PUBLIC_*` vão ao browser; **todo o resto é server-only**.
> Nunca exponha service-role/keys de integração no cliente.

## Comandos

```bash
npm ci              # instala dependências (lockfile)
npm run dev         # dev server em http://localhost:3000
npm run build       # build de produção (compila todas as páginas)
npm run start       # serve o build de produção
npm run lint        # eslint
npm test            # vitest run (one-shot)
npm run test:watch  # vitest em watch
npx tsc --noEmit    # checagem de tipos
```

## Rodando localmente

```bash
npm ci
npm run dev
# acesse http://localhost:3000
```

Primeiro acesso: faça **signup** → confirme e-mail (se exigido) → no 1º login o app
te leva a `/onboarding` para criar a escola (tenant). Ver o fluxo em
[ARCHITECTURE.md](ARCHITECTURE.md#onboarding).

> **Confirmação de e-mail:** se o signup parecer "não fazer nada", provavelmente o
> Supabase Auth está com *Confirm email* ligado (o usuário só tem sessão após clicar
> no link). Para dev, dá para desligar em **Authentication → Providers → Email →
> Confirm email** no dashboard do Supabase (do seu projeto de dev).

## Banco do zero (primeiro setup)

Só necessário se você **não** usa o projeto de dev compartilhado (que já tem schema e
dados) e vai apontar o `.env.local` para um **Supabase novo e vazio**:

1. Crie o projeto no Supabase e pegue URL/anon/service-role (Project Settings → API).
2. **Aplique todas as migrations de `db/migrations/` em ordem cronológica** (o prefixo
   `YYYYMMDD` é a ordem) no SQL editor do dashboard — elas criam tabelas, RLS, RPCs e
   triggers. Não há script único de bootstrap; as migrations **são** o schema.
3. (Opcional) Rode os scripts de `db/verify/` para conferir invariantes (ex.:
   `bootstrap_tenant_and_admin.verify.sql`).
4. Suba o app, faça signup e complete o `/onboarding` para criar seu primeiro tenant e
   dados.

> **Não** existe seed pronto e utilizável: o tenant de seed `Fix Idiomas`
> (`11111111-…`) tem dados mas **zero claims** (ninguém o acessa) — ver
> [TECH_DEBT.md](TECH_DEBT.md) TD-6. Gere seus próprios dados via a UI após o
> onboarding.

## Portões de qualidade (rode antes de entregar)

```bash
npx tsc --noEmit && npm test && npm run build
```

Para mudanças observáveis na UI, valide também no navegador. Para mudanças
não-triviais, rode o processo de revisão multi-agente (QA + senior + UX) descrito em
[BEST_PRACTICES.md](BEST_PRACTICES.md#processo-de-validação-antes-de-declarar-pronto).

## Testes

- Vitest, ambiente node, Supabase mockado. Testes de gateway em
  `src/lib/gateways/__tests__/`; libs puras em `src/lib/__tests__/`; server em
  `src/lib/server/__tests__/`.
- Detalhes do mock (resultados por tabela, filas, `_calls`, limites) em
  [BEST_PRACTICES.md](BEST_PRACTICES.md#o-mock-do-supabase).

```bash
npm test                                   # tudo
npx vitest run src/lib/__tests__/x.test.ts # um arquivo
```

## Sua primeira mudança (walkthrough)

Exemplo end-to-end de "expor um novo dado numa tela", mapeando as
[camadas](ARCHITECTURE.md#camadas) e as [regras](BEST_PRACTICES.md#regras-invioláveis):

1. **Domain gateway** — adicione/ajuste a query no gateway do domínio (ex.:
   `src/lib/gateways/studentGateway.ts`). Use o cliente anon; **não** envie
   `tenant_id` (o banco preenche); use `mapErr` para erros; **não** engula erro.
2. **Adapter** — se a UI consome via `financeGateway`, exponha/normalize lá
   (`src/lib/financeGateway.ts`). Código novo pode importar o domain gateway direto.
3. **Página** — a `.jsx` chama o gateway e renderiza. Lógica pura (formatação,
   derivação) que dê para testar → **extraia para `src/lib/*`** e exporte (padrão de
   `sessionDisplay.ts`/`revenueKpis.ts`), não deixe embutida no `.jsx`.
4. **Teste** — adicione/ajuste o teste do gateway em
   `src/lib/gateways/__tests__/` (ou da lib pura em `src/lib/__tests__/`). Detalhes do
   mock em [BEST_PRACTICES.md](BEST_PRACTICES.md#o-mock-do-supabase).
5. **Se envolver banco** (nova coluna/policy/RPC): crie a migration em
   `db/migrations/` — ver [DATABASE.md](DATABASE.md#fluxo-de-migrations) — e reveja
   [SECURITY.md](SECURITY.md) se mexer em RLS.
6. **Portões:** `npx tsc --noEmit && npm test && npm run build`; valide no navegador se
   for observável; rode a [revisão multi-agente](BEST_PRACTICES.md#processo-de-validação-antes-de-declarar-pronto)
   se a mudança for não-trivial.

## Banco de dados

Mudanças de schema/RLS/RPC entram como migrations em `db/migrations/` — ver o fluxo
em [DATABASE.md](DATABASE.md#fluxo-de-migrations). **Não** altere o banco de produção
sem versionar a migration e sem OK. Provisionar um banco novo do zero: ver
[Banco do zero](#banco-do-zero-primeiro-setup).

## Deploy

- Deploy na **Vercel** (Next.js). Configure as mesmas variáveis de ambiente em
  produção.
- Crons são definidos em `vercel.json` (ver [ARCHITECTURE.md](ARCHITECTURE.md#crons-verceljson)).
- Se uma feature depende de migration nova, **aplique a migration na prod antes** do
  deploy da rota que a usa.

## Rotas de debug (404 em produção)

- `/debug-jwt` — mostra `current_tenant_id()` e role conforme o token atual.
- `/debug-payments`, `/debug/claims`, `/dev/storage` — inspeção pontual.

## Troubleshooting

| Sintoma | Causa provável / o que checar |
|---|---|
| `Supabase não configurado (URL/ANON)` no import | falta `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` no `.env.local` |
| Sessão trava em "Preparando sessão…" | auth-lock: chamada `supabase.auth.*` dentro de `onAuthStateChange` sem `setTimeout(…,0)` — ver [BEST_PRACTICES.md](BEST_PRACTICES.md#o-auth-lock) |
| `current_tenant_id()` nulo após login | usuário sem claim em `user_claims` (ou token sem `tenant_id`) → deveria cair no `/onboarding` |
| Onboarding falha em `user_claims_role_check` | bootstrap tentando `role` inválida — só `admin`/`user` são permitidos; rode `db/verify/bootstrap_tenant_and_admin.verify.sql` |
| Tela de dados vazia sem erro | pode ser RLS negando (gateway não engole erro → veja o console) ou entitlement/paywall RESTRICTIVE |
| Gráfico/KPI de receita zerado | leitura das KPIs fora do helper `readCombinedRevenue` (chaves em inglês) |
| Erro de fuso (mês/horário errado) | uso de hora local onde deveria ser fuso SP explícito — ver [BEST_PRACTICES.md](BEST_PRACTICES.md#fuso-horário) |

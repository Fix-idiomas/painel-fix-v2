# Painel Fix v2 (DASH)

Aplicação web **multi-tenant** para gestão de escolas de idiomas (Fix-Idiomas):
cadastro (alunos, professores, turmas, pagadores), financeiro (mensalidades,
despesas, outras receitas), agenda/presença, relatórios, insights de IA por aluno e
cobrança de assinatura (Asaas).

**Stack:** Next.js 15 (App Router) · React 19 · Supabase (Auth, Postgres+RLS,
Storage) · TailwindCSS v4 · TypeScript · Vitest. Idioma de domínio/UI: **pt-BR**.

## 📚 Documentação

**Novo no projeto? Comece por [`docs/`](docs/README.md).**

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — rodar, testar, variáveis de ambiente, deploy, troubleshooting
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — camadas, fluxo de dados, rotas, módulos, sessão
- [docs/SECURITY.md](docs/SECURITY.md) — modelo multi-tenant (RLS), papéis, footguns
- [docs/BEST_PRACTICES.md](docs/BEST_PRACTICES.md) — boas práticas de arquitetura e engenharia
- [docs/DATABASE.md](docs/DATABASE.md) — migrations, RPCs, verificação, crons
- [docs/TECH_DEBT.md](docs/TECH_DEBT.md) — dívida técnica conhecida

## Início rápido

```bash
npm ci
# crie .env.local (ver docs/DEVELOPMENT.md)
npm run dev            # http://localhost:3000
```

Variáveis mínimas (cliente):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Rotas admin/cron e integrações exigem chaves **server-only** (service-role,
Anthropic, Mailgun, Asaas, `CRON_SECRET`). Lista completa em
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#variáveis-de-ambiente).

## Scripts

| Comando | O quê |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção |
| `npm run start` | serve o build |
| `npm run lint` | eslint |
| `npm test` | testes (vitest, one-shot) |
| `npm run test:watch` | testes em watch |

Portões antes de entregar: `npx tsc --noEmit && npm test && npm run build`.

## Estrutura (alto nível)

```
src/
  app/           rotas (App Router): (auth), (app), api, onboarding
  components/    UI compartilhada
  contexts/      SessionContext
  lib/           gateways, finance, ai, server, helpers
  types/
db/
  migrations/    schema/RLS versionados (fonte da verdade)
  verify/        scripts SQL read-only de verificação
docs/            documentação (comece aqui)
```

Detalhes em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Segurança (resumo)

- Nunca envie `tenant_id` do frontend — o banco preenche via `current_tenant_id()`.
- Browser usa **anon key**; service-role é **server-only**.
- Permissão vem do banco (RLS + RPC), nunca da sessão.

Modelo completo em [docs/SECURITY.md](docs/SECURITY.md).

## Deploy

Vercel (Next.js), com as mesmas variáveis de ambiente em produção. Crons em
`vercel.json`. Migrations aplicadas na prod **antes** do deploy que as usa.

## Licença

Uso interno da Fix-Idiomas (sem declaração de licença pública).

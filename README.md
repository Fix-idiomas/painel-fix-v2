# Painel Fix v2 (DASH)

Aplicação web multi-tenant para gestão escolar. Stack principal: Next.js (App Router), React, Supabase (Auth, Postgres, Storage) e Tailwind (CSS utilitário).

## Visão Geral
- Multi-tenant: cada conta opera isolada por `tenant_id` via RLS e funções RPC.
- Onboarding guiado: após login, se o usuário não possui tenant, é redirecionado para `/onboarding` para criar a escola (tenant) e definir seu nome de exibição.
- Fotos de alunos: upload com conversão client-side para WebP; aceita JPEG/PNG e PDF (primeira página) usando `pdfjs-dist`.
- Políticas/RPCs centrais: `current_tenant_id`, `get_tenant_settings`, `upsert_tenant_settings`, `bootstrap_tenant_and_admin`.

## Requisitos
- Node.js 20+ (LTS recomendado)
- Conta Supabase com projeto configurado

## Configuração
Crie um arquivo `.env.local` na raiz com as variáveis do Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=<sua-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<sua-anon-key>
```

> Dica: nunca commitar `.env.local`.

## Scripts
- `npm run dev`: roda o servidor de desenvolvimento
- `npm run build`: build de produção
- `npm run start`: inicia em modo produção (após build)
- `npm run lint`: lint do projeto

## Executando localmente
```powershell
# Instalar dependências
npm ci

# Rodar dev server
npm run dev
# Acesse http://localhost:3000
```

## Fluxo de Autenticação e Onboarding
- Signup cria o usuário no Supabase Auth. A sessão pode não existir até a confirmação de e‑mail.
- Login bem‑sucedido:
  - Se `current_tenant_id()` retornar `NULL`, o app redireciona para `/onboarding`.
  - Em `/onboarding`, chamamos `bootstrap_tenant_and_admin(p_tenant_name, p_display_name)` no banco, que:
    - Cria um registro em `public.tenants` e vincula o usuário em `public.user_claims` (role admin).
    - Um trigger em `tenants` (no banco) semeia `public.tenant_settings` do novo tenant.

### Rotas de debug úteis
- `/debug-jwt`: mostra `current_tenant_id()` e `current_role()` conforme o token atual.

## Storage de Fotos de Alunos
- Conversão client-side para WebP (limite de 1 MB antes do upload).
- Suporta JPEG/PNG. Para PDF, renderiza a primeira página via `pdfjs-dist` e converte para WebP.
- Caminho de upload e assinatura de URLs tratados em `src/app/(app)/alunos/page.jsx` e `lib/supabaseGateway.js`.

## Estrutura (alto nível)
```
src/
  app/
    (auth)/login | signup | reset-password
    (app)/alunos | financeiro | recepcao | ...
    onboarding/  (fluxo de criação do tenant)
  components/    (Sidebar, UserMenu, etc.)
  contexts/      (SessionContext)
  lib/           (supabaseClient, gateways, helpers)
```

## Supabase (Banco/RPCs)
- Funções usadas pelo app: `current_tenant_id`, `get_tenant_settings`, `upsert_tenant_settings`, `bootstrap_tenant_and_admin`.
- RLS referencia `current_tenant_id()`; certifique‑se de ativar RLS e grants adequados em produção.
- Ajustes de banco devem ser versionados em `db/migrations/` (rota recomendada: aplicar no painel do Supabase antes do commit, quando exigido).

## Deploy
- Compatível com Vercel (Next.js). Configure as mesmas variáveis de ambiente de produção.

## Solução de Problemas
- Onboarding falha com erro de `tenant_settings.brand_name`:
  - Verifique a função/trigger que semeia `tenant_settings` ao criar `tenants` (no banco). `brand_name` não pode ser `NULL`; use `NEW.name` ou `DEFAULT`.
- `current_tenant_id()` nulo após login:
  - Confirme se existe claim em `public.user_claims` para o usuário atual ou se o token possui `tenant_id`.
- Upload de imagens/PDF:
  - Tamanho máximo e conversão acontecem no cliente; valide permissões do bucket no Supabase Storage.

## Convenções
- Não commitar segredos.
- Mantenha mudanças de banco em migrations claras e idempotentes quando possível.
- Para alterações de fluxo de autenticação/tenant, valide em ambiente antes de abrir PR.

## Licença
Uso interno da Fix‑Idiomas (arquivo sem declaração de licença pública).
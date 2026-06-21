# PRDs — Monetização via assinatura paga (Asaas)

Conjunto de PRDs que define a transformação do **Painel Fix v2** de plataforma gratuita para **SaaS pago**, cobrando uma assinatura recorrente para acesso, via gateway **Asaas**.

## Problema & objetivo

Hoje qualquer pessoa cria conta, faz onboarding (`bootstrap_tenant_and_admin`) e usa o app sem limite. Queremos **tornar a plataforma rentável**: todo tenant nasce em um **trial gratuito**; ao fim do trial, é preciso uma **assinatura ativa** para continuar usando; falha de pagamento **bloqueia o acesso** até regularizar.

> ⚠️ As "mensalidades" internas existentes (`src/lib/gateways/paymentGateway.ts`) são o livro-razão das mensalidades **dos alunos da escola** — **não** têm relação com a cobrança *pela plataforma* descrita aqui. São conceitos distintos: "mensalidade do aluno" (receita do cliente) vs. "assinatura do tenant" (nossa receita).

## Decisões de produto (travadas)

| Tema | Decisão | Evolução futura |
|---|---|---|
| **Unidade de cobrança** | Uma assinatura **por tenant** (preço flat, independente do nº de professores) | Evoluir para **por-professor (seat)** — modelo de dados já preparado |
| **Método de cobrança** | **Assinatura recorrente no cartão de crédito** (auto-cobrança mensal via Asaas) | Pix/boleto recorrente como opção adicional |
| **Planos** | **Plano único pago + trial grátis de 14 dias** | Tiers (Free/Pro) |
| **Inadimplência** | **Bloqueio total no vencimento** (sem carência): assinatura inativa → paywall | Carência / modo somente-leitura |
| **Quem gerencia billing** | Apenas **owner/admin** do tenant (verificado server-side via RPC) | — |
| **Contas isentas (cortesia)** | Flag **`billing_exempt`** por tenant → entitlement vitalício, ignora cobrança. Aplicada a **contas específicas** já existentes (lista a definir) | Painel admin para alternar a flag |

## Os PRDs (sequência de entrega)

| # | PRD | Escopo (uma linha) | Depende de |
|---|---|---|---|
| 1 | [PRD-1 — Fundação de entitlement & paywall](PRD-1-entitlement-e-paywall.md) | Tabelas `subscriptions`, trial no onboarding, claim JWT, guard/paywall, cron de expiração. **Entrega trial + bloqueio funcionando, sem pagamento.** | — |
| 2 | [PRD-2 — Integração Asaas](PRD-2-integracao-asaas.md) | `asaas.ts`, webhook idempotente, rotas `/api/billing/*`, checkout no cartão. **Transforma trials em assinaturas pagas.** | PRD-1 |
| 3 | [PRD-3 — UI de billing & administração](PRD-3-ui-billing-e-admin.md) | Página `/assinatura`, aba "Plano e cobrança" na conta, gestão self-service. | PRD-1, PRD-2 |

**Por que 3 PRDs:** PRD-1 é entregável sozinho (trial + bloqueio), de-risca o resto e não depende da Asaas. PRD-2 concentra a dependência externa mais pesada. PRD-3 é a camada de UX/self-service, separável. A divisão permite revisar, aprovar e entregar em fatias.

## Arquitetura — decisões-chave

1. **Onde aplicar o paywall:** guard **client-side no layout do grupo `(app)`** (`src/app/(app)/layout.jsx`) + **claim JWT** como fast-path (zero ida ao banco no hot path), com a **linha da tabela `subscriptions` como fonte da verdade** (escrita por webhook/cron). Rejeitado: checar no middleware a cada request (custo de DB por navegação).
2. **Fonte da verdade vs. fast-path:** o status fica no claim do JWT para leitura barata, mas é o webhook/cron que escreve no banco. A defasagem (staleness) de até ~1h do token é mitigada por: (a) matemática de data local para expiração de trial; (b) cron diário; (c) `refreshSession()` forçado pós-checkout.
3. **Multi-tenant & segurança:** toda escrita em `subscriptions` vem do **service role** (bypassa RLS); a segurança cross-tenant depende de **resolver `tenant_id` pelo mapeamento Asaas armazenado**, nunca confiando em `tenant_id` vindo do corpo da requisição/webhook (regra pétrea do projeto — ver `README_ARQUITETURA.md`).

## Glossário

- **Tenant** — uma conta/escola. `1 tenant = 1 owner`. É a unidade cobrada na v1.
- **Owner / Admin** — papéis em `user_claims.role`. Só eles gerenciam billing.
- **Professor** — registro de dados (`teachers`) sob um tenant; nem sempre é um usuário com login. **Não** é a unidade cobrada na v1.
- **Trial** — período inicial gratuito (14 dias) que todo tenant ganha ao ser criado.
- **Entitlement** — direito de acesso ao app; ativo quando `billing_exempt = true`, ou `status = active`, ou `status = trial` (não expirado).
- **Isenção vitalícia (`billing_exempt`)** — flag por tenant que concede entitlement permanente e o exclui de cobrança, cron e rebaixamento por webhook. Usada para contas de cortesia / dono da plataforma.
- **Asaas** — gateway de cobrança brasileiro. Usaremos a API de **Assinaturas** (`/subscriptions`) com cartão de crédito.

## Convenções seguidas

- Migrations em `db/migrations/YYYYMMDD_*.sql`, aplicadas no painel Supabase e versionadas.
- Helper de serviço externo no padrão de `src/lib/mailgun.ts` (fetch, env-driven, retorna `{ ok, ... }`).
- Rotas de cron/webhook no padrão de `src/app/api/cron/dunning-reminders/route.ts` (service role + secret).
- Texto e domínio em **pt-BR**.

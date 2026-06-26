# Débitos técnicos

Itens conhecidos, deliberadamente adiados, com contexto suficiente para serem
retomados no futuro. Cada item registra: severidade, por que foi adiado, o
impacto atual, a correção proposta e o gatilho para tratá-lo.

---

## TD-1 — Idempotência de reassinatura concorrente (billing/subscribe) — ✅ RESOLVIDO (jun/2026)

- **Severidade:** 🟠 média
- **Origem:** PRD-3, revisão de segurança/QA do backend Pix (jun/2026)
- **Local:** [`src/app/api/billing/subscribe/route.ts`](../src/app/api/billing/subscribe/route.ts)
- **Resolução:** **claim atômico** (NÃO índice único parcial — `subscriptions` tem
  1 linha por tenant, então o duplicado é na Asaas, não em linhas). Migration
  `db/migrations/20260626_subscribe_claim.sql` adiciona `checkout_claim_at` + a
  função `claim_checkout(uuid)` (SECURITY DEFINER, só service_role): UPDATE
  condicional (`status<>'active' AND (checkout_claim_at IS NULL OR < now()-90s)`)
  que trava a linha no Postgres → só 1 request vence; o perdedor recebe 409. A
  janela de 90s é avaliada no servidor (sem timestamp na query string) e expira
  sozinha; o claim é liberado no sucesso (persist) e em qualquer falha (try/finally).
  **Pendente: aplicar a migration na prod ANTES do deploy da rota.**

### Problema (resolvido)
Sem idempotência, dois cliques concorrentes de reassinatura (trial/past_due/
canceled/expired) podiam criar **duas assinaturas na Asaas** (uma órfã). O claim
atômico serializa: só 1 request vence; o outro recebe 409.

### Verificação ao tratar (recomendada no go-live, em sandbox)
Concorrência real não é coberta pelo mock (Supabase mockado não modela row lock).
Validar contra Postgres real: 2 `claim_checkout(tenant)` em paralelo → exatamente
1 retorna true. Boundary da janela: `checkout_claim_at = now()-91s` permite
re-claim; `now()-89s` nega. Revisado por engenheiro sênior (✅ aprovado) e QA.

---

## TD-2 — Reconciliação de assinaturas órfãs na Asaas (billing/subscribe)

- **Severidade:** 🟠 média (latente; impacto atual ZERO — todas as contas isentas)
- **Origem:** revisão de QA do TD-1 (jun/2026)
- **Local:** [`src/app/api/billing/subscribe/route.ts`](../src/app/api/billing/subscribe/route.ts), [`src/lib/asaas.ts`](../src/lib/asaas.ts)
- **Gatilho para tratar:** **go-live** (antes de habilitar a 1ª conta NÃO isenta).

### Problema
`createSubscription` **não é idempotente** (diferente de `getOrCreateCustomer`,
que busca por `externalReference` antes de criar). Duas janelas geram assinatura
órfã na Asaas (cobrando o cliente sem registro local consistente):
1. **Timeout serverless**: se a função morre (maxDuration 30s) entre `createSubscription`
   ter criado na Asaas e o persist, o `finally` não roda; passados 90s, um retry
   cria uma **2ª** assinatura (a 1ª fica órfã). O claim do TD-1 NÃO cobre isto
   (a criação já aconteceu antes da morte).
2. **Dupla-falha**: se o persist falha E o `cancelSubscription` de compensação
   também falha (rede), a sub recém-criada fica órfã ativa.

### Por que adiar
Raro (exige morte no intervalo create→persist) e **impacto atual zero** (ninguém
não-isento usa o fluxo). A correção certa é não-trivial: `externalReference=tenantId`
é **compartilhado** entre a assinatura antiga e a nova, então "getOrCreate por
externalReference" não distingue qual reutilizar — precisa de lógica de reconciliação.

### Correção proposta
- **Reconciliação**: cron/rotina que lista assinaturas Asaas por `externalReference`
  e cancela as que não batem com `subscriptions.asaas_subscription_id` do tenant
  (espelha o padrão dos crons existentes, service-role). OU
- **Create idempotente**: antes de criar, listar subs Asaas por `externalReference`
  excluindo `oldSubId` e canceladas; reutilizar uma pendente se existir.
- Alertar/logar a órfã na dupla-falha de compensação para limpeza manual.

### Verificação ao tratar (sandbox)
Matar a função entre create e persist; confirmar que a reconciliação cancela a 1ª
e não deixa 2 assinaturas ativas. Testar dupla-falha (persist + cancel falham).

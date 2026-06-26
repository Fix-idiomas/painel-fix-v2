# Go-Live Asaas — Runbook de cobrança

> Plano para **ligar a cobrança real** (sair do sandbox). Hoje toda a infra está
> em produção mas **inerte**: as 6 contas atuais são `billing_exempt=true` (grátis
> para sempre, decisão travada). Go-live = passar a cobrar **contas novas**.

## Baseline (o que já está pronto em produção)

- **PRD-1/2/3** mergeados: paywall guard tri-estado, auth hook (claim `subscription`),
  tabelas `subscriptions`/`subscription_events`, **C1 enforcement** (policies
  RESTRICTIVE), webhook idempotente, rotas `/api/billing/{subscribe,cancel,status}`
  (cartão hospedado + **Pix inline**), página `/assinatura`, aba "Plano e cobrança".
- **Crons**: `expire-subscriptions` (backstop), `subscription-dunning` (e-mail de
  atraso), `reconcile-subscriptions` (TD-2, órfãs).
- **Débitos resolvidos**: TD-1 (idempotência de reassinatura), TD-2 (reconciliação).
- **Validado**: lint/tsc/216 testes/build; e2e externo real em **sandbox**
  (Asaas→preview→DB: status active, Pix, período).

Falta: conta Asaas de **produção**, decisões de produto, e validação e2e em prod.

---

## Gate 0 — Decisões de produto (TRAVAR antes de tudo) — *Owner: Produto*

| Decisão | Estado | Ação |
|---|---|---|
| **Preço mensal** (`PLAN_MONTHLY_BRL`) | **R$ 39,90** | ✅ travado |
| Métodos | cartão + Pix | ✅ travado |
| Trial | 30 dias sem cartão | ✅ travado (mas função viva ainda cria 14 — ver Fase 2) |
| **Carência** (`GRACE_DAYS`) | **30 dias** (readonly→blocked) | ✅ travado — **exige mudar código+DB (Fase 2)**: hoje é 7 |
| Política de reembolso/cancelamento | "sem fidelidade, reembolso…" | ⏳ **completar o texto** |
| Contas atuais | isentas para sempre | ✅ travado |

---

## Fase 1 — Conta Asaas de produção — *Owner: Você*

1. Ativar conta **Asaas produção** (dados da empresa + conta bancária de repasse).
2. Gerar **API key de produção**.
3. Configurar **webhook de produção**:
   - URL: `https://fixdash.com.br/api/webhooks/asaas`
   - Token (`asaas-access-token`) **≥ 32 caracteres**.
   - Eventos: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`,
     `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_*`, `SUBSCRIPTION_DELETED/_INACTIVATED`.
   - `poolInterrupted: false` (exigência Asaas).
4. PCI: checkout hospedado + Pix → **SAQ-A** (nenhum dado de cartão na nossa UI). ✅

---

## Fase 2 — Configuração de produção — *Owner: Eu (você fornece os segredos)*

> **Segredos (API key / webhook token) você seta — eu não manuseio credenciais.**

1. **Env vars na Vercel (Production)**:
   - `ASAAS_BASE_URL = https://api.asaas.com/v3`
   - `ASAAS_API_KEY = <prod>` *(você)*
   - `ASAAS_WEBHOOK_TOKEN = <prod ≥32>` *(você)*
   - `PLAN_MONTHLY_BRL = <preço final>`
   - `APP_URL = https://fixdash.com.br`
2. **Trial de 30 dias**: re-aplicar `bootstrap_tenant_and_admin` (migration
   `20260620_bootstrap_seeds_trial`) — a função viva no banco ainda cria 14 dias.
2b. **Carência 30 dias**: mudar `GRACE_DAYS` de 7→30 em `src/lib/entitlement.js`
   **e** `now() - interval '7 days'` → `'30 days'` na função `tenant_access_level`
   (migration `20260621_entitlement_enforcement`). Os dois devem bater (UI + banco).
3. **Auth hook**: confirmar `custom_access_token_hook` **HABILITADO** em
   Supabase → Authentication → Hooks (sem ele o claim não popula → paywall).
4. **Isenção só para contas atuais**: confirmar que `billing_exempt` é por
   **cutoff de `created_at`** → contas **novas NÃO nascem isentas** (entram em trial).
5. **Re-ligar Deployment Protection** do preview na Vercel (foi desligada p/ e2e).

---

## Fase 3 — Verificações pendentes (TD-2 + testes) — *Owner: Eu*

- **Sandbox**: confirmar que `GET /subscriptions?externalReference=` filtra
  **server-side** (único caminho teórico de cross-tenant na reconciliação).
- Testes dos route handlers dos crons (auth 401, agregação) — recomendado.

---

## Fase 4 — E2E controlado em produção — *Owner: Eu + Você*

Criar **1 conta nova de teste** (não isenta) em produção e exercitar:

1. **Cartão**: assinar → checkout hospedado → pagar → webhook `PAYMENT_CONFIRMED`
   → `status=active` → acesso liberado (sem novo login, via `refreshSession`).
2. **Pix**: assinar → QR inline + copia-e-cola → pagar → webhook → `active`.
3. **Cancelar** (aba Conta) → `canceled` → paywall.
4. **Inadimplência**: não pagar → `past_due` → carência (readonly) → `blocked`;
   conferir e-mail de **dunning**.
5. **Reconcile cron**: acionar manualmente → 0 órfãs / casos ambíguos logados.
6. Confirmar **nenhum dado de cartão** trafega/loga no nosso backend.

---

## Fase 5 — Virada — *Owner: Você decide a data*

- A partir da data X: **novas contas** entram em trial 30d e precisam pagar.
- As **6 contas atuais** seguem `billing_exempt=true` (confirmado).
- Comunicação/onboarding: mencionar cobrança ao fim do trial (se aplicável).

---

## Fase 6 — Monitoramento (primeiro ciclo) — *Owner: Eu/Você*

- **Webhook**: painel Asaas (entregas) + logs `[billing:webhook]`.
- **Dunning**: e-mails do cron `subscription-dunning`.
- **Reconcile**: cron 06:30 sem órfãs.
- **Primeira renovação mensal**: confirmar cobrança recorrente do cartão/Pix.

---

## Rollback / kill-switches

- **Enforcement C1**: kill-switch comentado em
  `20260621_entitlement_enforcement.sql` (dropa as policies `_ent_*`) → volta ao
  estado "sem bloqueio de dados".
- **Reverter env** para sandbox (desliga a cobrança real).
- **`billing_exempt = true` em massa** para pausar cobrança sem derrubar acesso.

## Riscos & mitigação

| Risco | Mitigação |
|---|---|
| Staleness do claim (~1h após webhook) | cron backstop + `refreshSession` pós-checkout |
| Webhook não entregar | Asaas re-tenta em não-2xx; idempotência por `asaas_event_id` |
| Cobrar conta atual por engano | isenção por `created_at`; verificar `billing_exempt` antes da virada |
| Órfã por timeout (raro) | cron `reconcile-subscriptions` (TD-2) |
| TD-2 cross-tenant teórico | verificar `externalReference` server-side (Fase 3) |

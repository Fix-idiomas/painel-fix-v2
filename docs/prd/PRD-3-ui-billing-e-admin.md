# PRD-3 — UI de billing & administração

> **Status:** proposto · **Sequência:** 3 de 3 · **Depende de:** PRD-1, PRD-2
> Ver visão geral e decisões travadas no [README dos PRDs](README.md).

## 1. Contexto & objetivo

Com a fundação (PRD-1) e a integração Asaas (PRD-2) prontas, este PRD entrega a **experiência self-service de assinatura**: a página de **conversão/paywall** (`/assinatura`) e a aba de **gestão contínua** ("Plano e cobrança") dentro da conta. O objetivo é que o owner consiga **assinar, ver status e gerenciar** a cobrança sem suporte manual.

**Resultado observável:** owner em trial vê o countdown e um CTA claro; assina pela `/assinatura`; depois acompanha plano, próximo vencimento, troca de cartão e cancelamento pela aba "Plano e cobrança".

## 2. Escopo

**In:**
- `/assinatura` completa: estado (trial/ativo/past_due/expirado), countdown, formulário de assinatura (hosted/tokenizado), tratamento de retorno.
- Aba **"Plano e cobrança"** em `src/app/(app)/conta/page.jsx`: status atual, fim do período, atualizar cartão, cancelar.
- Mensageria de trial/dunning/bloqueio (banners, estados vazios).
- Gating de UX: apenas **owner/admin** vê/gerencia billing.

**Out:**
- Tiers/planos múltiplos, cupons, cobrança por seat (futuro).
- Faturas em PDF/portal financeiro completo (link para o painel Asaas, se necessário).

## 3. Requisitos funcionais

- **RF-1** — `/assinatura` mostra o estado correto:
  - **trial** → dias restantes + CTA "Assinar agora".
  - **active** → confirmação + próximo vencimento + acesso à gestão.
  - **past_due** → aviso de pagamento pendente + ação de regularizar.
  - **expired/canceled** → paywall com CTA de assinatura.
- **RF-2** — Formulário de assinatura usa **checkout hospedado** ou **cartão tokenizado** (sem campos de PAN/CVV trafegando pelo nosso backend), chamando `POST /api/billing/subscribe` (PRD-2).
- **RF-3** — Ao concluir, o cliente chama `supabase.auth.refreshSession()` e o app destrava sem novo login.
- **RF-4** — Aba "Plano e cobrança" em `conta` exibe: plano, `status`, `current_period_end`/`trial_end`, método de pagamento (mascarado), e ações **Atualizar cartão** e **Cancelar assinatura**.
- **RF-5** — **Cancelar** chama `POST /api/billing/cancel` (PRD-2), com confirmação; reflete o novo status.
- **RF-6** — Toda a área de billing é visível/operável **apenas** para owner/admin; demais usuários veem estado informativo ("fale com o administrador").
- **RF-7** — Banner global de trial expirando (ex.: ≤ 3 dias) e de `past_due`, consistente com o `<SubscriptionGuard>` (PRD-1).

## 4. Requisitos não-funcionais

- **RNF-1 (consistência visual)** — Reusa componentes existentes (`Kpi`, `Modal`/`AppModal`, `Tabs`, padrões do `AppShell`) e o estilo do `conta/page.jsx` atual.
- **RNF-2 (segurança)** — O gating de UX é conveniência; a autorização real é **server-side** (RPC owner/admin nas rotas do PRD-2). Nunca confiar só no estado de sessão do cliente.
- **RNF-3 (acessibilidade/i18n)** — pt-BR, foco/teclado nos modais, mensagens claras de erro de pagamento.
- **RNF-4 (resiliência)** — Estados de carregamento e erro para chamadas de billing; idempotência de clique (evitar dupla assinatura).

## 5. Arquitetura / UI

- **`src/app/(app)/assinatura/page.jsx`** — evolui a versão mínima do PRD-1 para a experiência completa; consome `useSession` (status) + rotas de billing.
- **`src/app/(app)/conta/page.jsx`** — adiciona aba "Plano e cobrança" ao mecanismo de `tab` já existente; componentes de billing compartilhados com `/assinatura` (extrair para `src/components/billing/*` se necessário).
- **Mensageria** — banners reaproveitando o cálculo de entitlement do guard (fonte única de verdade do estado).

## 6. Arquivos a criar/alterar

**Criar (se extrair compartilhados):** `src/components/billing/*` (ex.: `PlanCard`, `SubscribeForm`, `BillingStatusBanner`).
**Alterar:** [src/app/(app)/assinatura/page.jsx](../../src/app/(app)/assinatura), [src/app/(app)/conta/page.jsx](../../src/app/(app)/conta/page.jsx).

## 7. Critérios de aceite

- [ ] Owner em trial vê dias restantes e consegue assinar; ao concluir, o app destrava sem novo login.
- [ ] Cada estado (`trial`/`active`/`past_due`/`expired`/`canceled`) renderiza a mensagem/ação correta em `/assinatura`.
- [ ] Aba "Plano e cobrança" mostra status, vencimento e método mascarado; permite cancelar (com confirmação) e atualizar cartão.
- [ ] Usuário **não** owner/admin não vê controles de billing; tentativa direta às rotas é negada server-side.
- [ ] Banner de trial expirando e de `past_due` aparece de forma consistente com o guard.
- [ ] Nenhum dado de cartão trafega/loga pelo nosso backend.

## 8. Verificação (manual, sandbox)

1. Com tenant em trial, abrir `/assinatura` → conferir countdown e CTA.
2. Assinar com cartão de teste → confirmar destravamento e status `active`.
3. Abrir `conta` → "Plano e cobrança" → conferir dados e cancelar → status `canceled` + paywall.
4. Logar como usuário não-admin → confirmar ausência de controles e bloqueio server-side.
5. Forçar `past_due` (PRD-2) → conferir banner e fluxo de regularização.

## 9. Riscos

| Risco | Mitigação |
|---|---|
| **Confiar só no gating de UI** | Autorização real nas rotas (RPC owner/admin); UI é conveniência |
| **Dupla assinatura por clique** | Desabilitar botão durante a chamada; idempotência por `externalReference=tenantId` (PRD-2) |
| **Mensagem inconsistente guard vs. página** | Fonte única do cálculo de entitlement (mesmo helper do `<SubscriptionGuard>`) |
| **PCI na UI** | Hosted/tokenizado; sem campos de cartão no nosso domínio |

## 10. Métricas de sucesso

- Conversão trial → pago (taxa e tempo até assinar).
- % de gestões de billing feitas em self-service (sem suporte).
- Recuperação de `past_due` (quantos regularizam sem churn).
- 0 incidentes de exposição de dado de cartão.

## 11. Dependências

- PRD-1 e PRD-2 em produção.
- Definição final de copy/preço e identidade visual da página de assinatura.

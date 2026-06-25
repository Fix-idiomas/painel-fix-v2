# PRD-3 — UI de billing & administração

> **Status:** proposto · **Sequência:** 3 de 3 · **Depende de:** PRD-1, PRD-2
> Ver visão geral e decisões travadas no [README dos PRDs](README.md).

## 1. Contexto & objetivo

Com a fundação (PRD-1) e a integração Asaas (PRD-2) prontas, este PRD entrega a **experiência self-service de assinatura**: a página de **conversão/paywall** (`/assinatura`) e a aba de **gestão contínua** ("Plano e cobrança") dentro da conta. O objetivo é que o owner consiga **assinar, ver status e gerenciar** a cobrança sem suporte manual.

**Resultado observável:** owner em trial vê o countdown e um CTA claro; assina pela `/assinatura`; depois acompanha plano, próximo vencimento, troca de cartão e cancelamento pela aba "Plano e cobrança".

## 2. Escopo

**In:**
- `/assinatura` completa, cobrindo o **entitlement tri-estado** (PRD-2): `trial`, `trial` expirando, `active`, **`readonly` (carência)**, `past_due`, `expired`/`canceled` e `billing_exempt` (cortesia).
- **Checkout hospedado da Asaas** com escolha de método **cartão ou Pix** (sem campos de cartão no nosso domínio).
- **Banner global** (no `AppShell`) de aviso antes do bloqueio (trial ≤3 dias, carência/`past_due`).
- Aba **"Plano e cobrança"** em `src/app/(app)/conta/page.jsx`: status, fim do período, método mascarado, trocar cartão/método, cancelar.
- **Microcopy pt-BR** e e-mails de dunning (tom de parceria).
- Gating de UX: apenas **owner/admin** vê/gerencia billing (com estado informativo para os demais).

**Out:**
- Tiers/planos múltiplos, cupons, cobrança por seat (futuro).
- Faturas em PDF/portal financeiro completo (link para o painel Asaas, se necessário).

## 3. Requisitos funcionais

- **RF-1** — `/assinatura` mostra o estado correto (ver microcopy no §12):
  - **trial** → dias restantes (+ data absoluta) + CTA "Assinar agora".
  - **trial expirando (≤3 dias)** → urgência leve + CTA.
  - **active** → confirmação + próximo vencimento + acesso à gestão.
  - **readonly (carência)** → "acesso em modo leitura, regularize para voltar a operar" + CTA.
  - **past_due** → ação **Atualizar forma de pagamento** (distinta de "assinar" — já existe assinatura).
  - **expired/canceled** → paywall com CTA "Assinar novamente".
  - **billing_exempt** → "Acesso de cortesia", **sem** CTA de cobrança.
- **RF-2** — Assinatura via **checkout hospedado da Asaas** com escolha de método **cartão ou Pix** (sem PAN/CVV no nosso backend), chamando `POST /api/billing/subscribe` (PRD-2). Botão com loading/anti-duplo-clique.
- **RF-3** — Ao concluir, o cliente chama `supabase.auth.refreshSession()` e o app destrava sem novo login; tratar retorno sucesso/cancelado/falha.
- **RF-4** — Aba "Plano e cobrança" em `conta` exibe: plano, `status`, `current_period_end`/`trial_end` (data absoluta), método mascarado, e ações **Trocar cartão/método** e **Cancelar assinatura**. Lê status do **claim** e dados via rotas (service role) — **nunca** tabela de negócio (anti-deadlock, PRD-2 §5.4).
- **RF-5** — **Cancelar** chama `POST /api/billing/cancel` (PRD-2), via `ConfirmDeleteModal` existente com **tom adaptado** (cancelar ≠ deletar; deixar claro até quando o acesso continua; ação de escape "Manter assinatura").
- **RF-6** — Billing visível/operável **apenas** para owner/admin; demais veem **estado informativo** ("Apenas o proprietário/administrador gerencia a assinatura. Fale com [owner].") — não esconder silenciosamente.
- **RF-7** — **Banner global** no `AppShell` em trial ≤3 dias / carência / `past_due`, usando a **mesma fonte de verdade** do guard (`useSubscription`/`entitlement`). Dispensável por sessão, reaparece a cada login enquanto durar.
- **RF-8** — **Paywall com contexto**: o `<SubscriptionGuard>` preserva a rota de origem (`?next=`) e a `/assinatura` explica o motivo do bloqueio ("você tentou acessar **Financeiro**…"); microcopy por motivo (trial vencido vs. carência vs. past_due vs. canceled).
- **RF-9** — Para `billing_exempt`, a aba de conta mostra só "Acesso de cortesia — sem cobrança" e **oculta** vencimento/cancelar/trocar método. (É o estado que a maioria verá no dia 1 do rollout.)

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

## 12. Microcopy (pt-BR) por estado

> Base entregue pelo trabalho de Design; ajustar tom/preço na implementação.

- **Trial:** "Você está no período de teste — acesso completo até **{data}** (faltam {n} dias). Assine quando quiser para não perder nada." · CTA `Assinar agora`
- **Trial ≤3 dias (banner):** "⏳ Seu teste termina em **{n} dias** ({data}). Assine para manter alunos, turmas e financeiro sempre à mão." · CTA `Assinar agora`
- **Carência (readonly):** "Seu acesso está em **modo leitura**. Você ainda vê e exporta seus dados, mas para voltar a lançar/editar é preciso regularizar." · CTA `Regularizar`
- **Bloqueado por trial vencido:** "Seu período de teste terminou. Seus dados estão guardados e seguros — reative em menos de 1 minuto para voltar de onde parou." · CTA `Assinar agora` · _pagamento seguro pela Asaas 🔒_
- **past_due:** "Não conseguimos confirmar seu último pagamento — pode ser limite, validade ou erro temporário. Atualize para reabrir o acesso, sem perder nada." · CTA `Atualizar forma de pagamento`
- **expired/canceled:** "Sua assinatura está inativa. Para voltar a usar o painel, assine novamente. Seus dados continuam aqui esperando por você." · CTA `Assinar novamente`
- **active (conta):** "Assinatura ativa ✓ · Próxima cobrança em **{data}** · {método mascarado}" · `Trocar método` `Cancelar assinatura`
- **billing_exempt:** "Acesso de cortesia — sua conta tem acesso liberado, sem cobrança."
- **Confirmar cancelamento:** "Você continua com acesso completo até **{data}** (período já pago). Depois disso o painel é pausado, mas seus dados ficam guardados." · `Manter assinatura` / `Cancelar mesmo assim`
- **E-mail dunning (1ª falha):** tom de parceria — "Tentamos renovar a assinatura da {escola} hoje, mas o pagamento não passou. Geralmente é limite/validade. Atualize em 1 minuto: {link}."

## 13. Acessibilidade (WCAG AA)

- Não depender de cor: cada estado tem ícone + título textual.
- Contador como `aria-live="polite"`; data absoluta além do relativo ("{n} dias — até {data}").
- Modais com focus-trap e retorno de foco ao gatilho; Tabs da conta com `role=tablist/tab/tabpanel` + navegação por setas.
- Alvos de toque ≥44px; foco visível nos CTAs; idempotência de clique (botão `disabled`+spinner durante a chamada).
- Migrar a `/assinatura` para os tokens `--p-*`/classes `p-card`/`p-btn` (herda a cor da marca do tenant) e conferir contraste dos banners.

## 14. Protótipo

Mockup visual interativo dos estados-chave (paywall por estado, banner global e aba "Plano e cobrança"): [`prototipo-assinatura.html`](prototipo-assinatura.html) — arquivo standalone, abre no navegador, alterna entre os 7 estados (trial, trial ≤3 dias, ativo, carência/leitura, atrasado, bloqueado, cortesia). Referência de layout/copy, não código final.

# Débitos técnicos

Itens conhecidos, deliberadamente adiados, com contexto suficiente para serem
retomados no futuro. Cada item registra: severidade, por que foi adiado, o
impacto atual, a correção proposta e o gatilho para tratá-lo.

---

## TD-1 — Idempotência de reassinatura concorrente (billing/subscribe)

- **Severidade:** 🟠 média
- **Origem:** PRD-3, revisão de segurança/QA do backend Pix (jun/2026)
- **Local:** [`src/app/api/billing/subscribe/route.ts`](../src/app/api/billing/subscribe/route.ts)
- **Gatilho para tratar:** **go-live** (quando houver cobrança real), junto com a
  configuração da conta Asaas de produção.

### Problema
O guard de `409` só bloqueia quem já está `active`. Para tenants em `trial`,
`past_due`, `canceled` ou `expired` que reassinam, **não há idempotência real**.
Dois cliques quase simultâneos (duplo-clique entre abas, ou retry por latência)
podem criar **duas assinaturas na Asaas**: ambos os requests leem o mesmo
`existing` (mesmo `oldSubId`), ambos criam assinatura nova (A e B), os dois
`UPDATE` rodam (last-write-wins → banco fica com A *ou* B) e a assinatura
perdedora vira **órfã** (o `cancel-old` só cancela a `oldSubId` original, não a
concorrente).

### Impacto atual: ZERO
- Todas as contas atuais são `billing_exempt = true` → ninguém exercita o fluxo.
- O **webhook é a fonte da verdade** do status (reconcilia).
- O botão da UI fica **desabilitado durante a chamada** (anti-duplo-clique na aba).

### Por que foi adiado
Implementar agora adiciona risco ao **caminho de pagamento já validado em e2e**
(o mais crítico) sem ganho atual. O lock otimista com compensação tem um modo de
falha pior que o bug: um **falso positivo** cancelaria uma assinatura legítima de
quem pagou. Além disso, a suíte (Supabase mockado) **não exercita concorrência** —
não há arnês para validar o fix com confiança hoje.

### Correção proposta (preferir a determinística)
1. **Determinística (recomendada):** índice único parcial em `subscriptions`
   impedindo > 1 assinatura ativa/pendente por tenant no nível do banco
   (migration + reaplicar em prod). Sem o modo de falha de "cancelar assinatura
   legítima"; testável.
2. Alternativa: lock otimista no `UPDATE`
   (`... WHERE tenant_id = ? AND asaas_subscription_id IS NOT DISTINCT FROM oldSubId`,
   abortar + compensar se 0 linhas) — exige `IS NOT DISTINCT FROM` (branch null vs
   não-null) e `.select()` para contagem; mais frágil.

### Verificação ao tratar
Teste de concorrência contra Asaas sandbox/prod real (não o mock): dois requests
paralelos de reassinatura → garantir 1 única assinatura na Asaas e linha
consistente no banco; nenhuma assinatura legítima cancelada por engano.

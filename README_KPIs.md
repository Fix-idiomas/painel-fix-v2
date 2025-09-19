# KPIs de Receitas — Política por Tenant (due_date x competence_month)

## Política ativa por tenant
- `finance_policy ∈ {"due_date","competence","both"}` (padrão: `due_date`).
- Quando `both`, a UI oferece alternância (“Fluxo de Caixa” | “Competência”).

## Definições canônicas

### A) Fluxo de Caixa (due_date)
Base para **previstos** e “atraso”.
- `receita_prevista_mes` = soma de `amount` com `status = "pending"` e `due_date` no mês-alvo; **excluir `canceled`**.
- `receita_a_receber` = subset de `pending` no mês-alvo com `due_date >= hoje`.
- `receita_atrasada`  = subset de `pending` no mês-alvo com `due_date < hoje`.
- `receita_recebida`  = soma de `amount` com `status = "paid"` e **`paid_at` no mês-alvo**.
  - Se `paid_at` estiver ausente, marcar inconsistente (não realocar por `due_date`).

### B) Competência (competence_month)
Base **contábil** (não existe “atrasado”).
- `comp_receita_prevista_mes`   = soma de `amount` com `status ∈ {"pending","paid"}` e `competence_month` no mês-alvo; **excluir `canceled`**.
- `comp_receita_realizada_mes`  = soma de `amount` com `status = "paid"` **alocado ao `competence_month`** correspondente (não ao `paid_at`).
- `comp_diferenca_previsto_realizado` = `comp_previsto - comp_realizado`.

## Status (pétrea)
- `canceled` nunca entra em previstos/atrasados/recebidos.
- `pending` divide-se em **a vencer** vs **atrasado** apenas por `due_date` comparado a “hoje”.

## Contrato das rows
PaymentRow {
  id: string
  status: "pending" | "paid" | "canceled"
  amount: number
  due_date: "YYYY-MM-DD"
  paid_at?: "YYYY-MM-DD" | null
  competence_month?: "YYYY-MM-01" | null
}

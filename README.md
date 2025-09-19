## KPIs de Receitas — Fonte de Verdade

Desde setembro/2025, todos os KPIs de receitas exibidos no Dashboard (Início) são calculados exclusivamente via helpers centralizados:

- `computeRevenueKPIs` (em `src/lib/finance/helpers.js`)

Os KPIs antigos (vindos do backend/gateway, como `total_billed`, `total_paid`, etc.) são considerados **obsoletos** e não devem mais ser usados para exibição ou lógica de negócio.

O backend/gateway agora retorna apenas rows crus, sem cálculos de KPIs de receita.

### KPIs disponíveis via helpers
- `receita_prevista_mes`
- `receita_recebida`
- `receita_atrasada`
- `receita_a_receber`

Esses valores são a única fonte de verdade para todas as telas e relatórios financeiros.

> **Governança:** Qualquer divergência entre telas deve ser resolvida usando apenas os helpers centralizados. KPIs antigos devem ser removidos do código e da documentação.
## Mapeamento de KPIs/Cards do Painel

### 1. Dashboard (Início)
**Cards exibidos:**
- Receita total prevista
- Receita recebida
- Receita em atraso
- Alunos ativos

**Critérios/Fonte:**
- Calculados para o mês selecionado.
- Funções utilitárias (ex: `computeFinanceCardsFromRows`).
- Dados vêm de pagamentos e alunos ativos.

### 2. Financeiro
**Cards exibidos:**
- Professores (alunos ativos)
- Receita (vencimento)
- Despesas (todas)
- Saldo de caixa
- Saldo operacional
- Receita a receber
- Receita atrasada
- Receita recebida

**Critérios/Fonte:**
- Mistura de dados do backend (`financeGateway.getMonthlySummary`) e cálculos locais (`computeFinanceCardsFromRows`).
- Alguns cards vêm do backend (ex: saldo de caixa, saldo operacional).
- Outros são calculados no frontend a partir das rows de pagamentos (receita a receber, atrasada, recebida).
- Professores/alunos ativos pode ser calculado ou trazido do backend.

### 3. Gastos
**Cards exibidos:**
- Total do mês
- Pagos
- Pendentes
- Em atraso

**Critérios/Fonte:**
- Calculados a partir dos lançamentos de despesas do mês.
- Funções utilitárias específicas para despesas.
- Status dos lançamentos: pago, pendente, em atraso.

### 4. Divergências e Duplicidades
- **Receita recebida/atrasada/a receber** aparecem em mais de uma tela, mas podem ser calculadas por competência ou por due_date.
- **Alunos ativos/Professores**: nomenclatura e critério podem variar.
- **Saldo de caixa/operacional**: pode ser calculado localmente ou trazido do backend.
- **Despesas**: Gastos e Financeiro podem ter lógicas diferentes para KPIs de despesas.

### 5. Fontes de cálculo
- **Helpers centralizados**: `computeFinanceCardsFromRows`, `getPaymentStatusLabel`, etc.
- **Backend**: `financeGateway.getMonthlySummary`, `supabaseGateway.listPayments`, etc.
- **Frontend**: Cálculos locais a partir das rows carregadas.

### 6. Recomendações para Centralização
- Criar helpers únicos para cálculo de KPIs de receitas e despesas, usados por todas as telas.
- Padronizar nomes e ordem dos cards.
- Documentar claramente o critério de cada KPI (por competência, por due_date, etc).
- Garantir que todos os cards sejam calculados a partir de dados consistentes, evitando duplicidade de lógica.
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

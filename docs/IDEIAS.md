# Ideias de funcionalidades

Backlog de melhorias de produto, **separado** da lista de erros
([AUDITORIA_2026-11.md](AUDITORIA_2026-11.md)). Cada ideia tem o problema que resolve,
um esboço e o momento sugerido para fazer.

**Status:** 💡 ideia · 📋 planejada · 🔧 em andamento · ✅ entregue

---

## I1. Página financeira do aluno — 💡

*Registrada em 2026-11-19.*

**Problema:** hoje não há como ver a vida financeira de **um** aluno. A tela de
Mensalidades mostra um mês por vez, de todos os alunos. Com a regra decidida no item A9
da auditoria (aluno inativo **mantém** os débitos até alguém cancelar à mão), falta um
lugar para enxergar e tratar esses débitos aluno por aluno.

**Esboço:**
- **Onde:** `/alunos/[id]/financeiro`, ao lado da evolução pedagógica
  (`/alunos/[id]/evolucao`). Outra opção é transformar as duas em abas de uma página
  única do aluno.
- **Resumo:** total pago, em aberto e vencido, e há quantos dias está em atraso.
- **Histórico mês a mês:** competência, vencimento, valor, situação, data de pagamento
  e motivo do cancelamento.
- **Lembretes enviados:** a partir de `finance_reminders_log`.
- **Ações:** marcar como pago, cancelar as selecionadas e reabrir, reaproveitando o
  `paymentGateway`. Isso também resolve o caso do aluno inativado no meio do mês.
- **Dados:** já existem (`payments.student_id`, `finance_reminders_log.student_id`),
  sem tabela nova. O acesso passa pelo `financeGateway`, sem Supabase direto na página.
- **Permissão:** só quem tem `is_admin_or_finance_read`. Professores continuam vendo só
  a evolução.

**Depende de:**
- [x] A2/A3, a lista de pagamentos completa e com a janela de mês correta (lote 1).
- [ ] M1, "hoje" no fuso de Brasília, para o cálculo de dias em atraso.
- [ ] O lote 1 em produção.

**Quando fazer:** depois do lote 1 em produção e dos itens críticos de cobrança
(C3/C4). É um bom momento antes de revisar à mão as pendências antigas de alunos
inativos (35 na Fix Idiomas), porque a página facilita essa revisão.

# 📘 README — Arquitetura e Funcionamento do Site (Fix Flow / Painel Fix)

## 1. Arquitetura em Camadas

### Frontend
- **Next.js (App Router)** + **React** + **TailwindCSS**.  
- Páginas `use client` com hooks de sessão (`useSession`) e chamadas a *gateways*.  
- **Controle de acesso na UI**:
  - **Gastos**: permissões validadas via RPC no DB (`is_admin_or_finance_read/write`).  
  - **Cadastros**: hoje ainda com guard baseado em roles de sessão, mas **migrando para DB-first**, mesmo padrão de Gastos.

### Gateways
- **`financeGateway`**
  - Adapter fino → reexporta chamadas do `supabaseGateway`.
  - Aplica normalizações simples (status, cost_center).
  - Garante shape consistente (`{ rows, kpis }`).
  - Sem acesso a service-role, sem bypass de RLS.

- **`supabaseGateway`**
  - Sempre usa cliente **anon** (browser).
  - Nunca engole erros: se RLS negar, a UI recebe vazio/erro.
  - Executa queries brutas, sem “corrigir” permissões.

### Backend (Supabase)
- Banco **Postgres** com **RLS (Row Level Security)** habilitado em todas as tabelas multi-tenant.  
- **Tenant isolation**:
  - Cada tabela tem coluna `tenant_id uuid not null default current_tenant_id()`.
  - Policies sempre incluem `tenant_id = current_tenant_id()`.
  - Usuário **nunca** envia `tenant_id` → banco preenche sozinho.

---

## 2. Sessão e Permissões
- **Sessão**: contém apenas dados mínimos (id do usuário, tenant atual, flags simples).  
- **Permissões reais**: decididas no banco via funções RPC:
  - `is_admin_or_finance_read(p_tenant)`
  - `is_admin_or_finance_write(p_tenant)`
  - *(em breve)* `is_admin_or_registry_read/write(p_tenant)` para Cadastros.  

- **Granularidade**: separação clara entre:
  - `canReadDB` → SELECT.  
  - `canWriteDB` → INSERT/UPDATE/DELETE.  

### Fluxo típico em uma página
1. Chama `current_tenant_id()`.  
2. Faz RPC de permissão (`…_read` / `…_write`).  
3. Se `canReadDB = true`, dispara fetch de dados.  
4. UI mostra:
   - Dados → se autorizado.  
   - “Acesso negado” inline → se negado.  
   - “Carregando…” → durante checagem.  

---

## 3. Módulos Principais

### Financeiro
- **Mensalidades (Receitas)**  
  - KPIs calculados no banco (`getMonthlyFinancialSummary`).  
  - `status = pending / paid / canceled`.  
  - Filtragem principal por `due_date`.

- **Despesas (Gastos)**  
  - Tabelas: `expense_entries` (lançamentos), `expense_templates` (recorrentes).  
  - Filtragem por `status` e `cost_center` (ainda parcialmente no server).  
  - Critério de mês: hoje `competence_month`, em revisão para alinhar com `due_date`.

- **Outras receitas**  
  - Usa `other_revenues`, mas ainda com policies mistas (`current_role/current_can`) → precisa unificação.  

- **Professores (payout)**  
  - Cálculos por mês via funções no gateway.

### Cadastros
- **Students, Teachers, Payers, Turmas**  
  - Policies atuais: `is_admin_or_classes_*` ou `current_role/current_can`.  
  - Em revisão para migrar para `is_admin_or_registry_read/write`.  
- **UI Cadastros**  
  - Hub com links para cada módulo.  
  - Hoje restringe acesso via `Guard roles={["admin","financeiro"]}` → será migrado para **DB-first**.

### Agenda
- **Sessions, Attendance, Turma_members**  
  - Policies permitem professores mexerem apenas no que é “deles” (`teacher_id_snapshot = current_teacher_id()`).  
  - Sempre restritas a `tenant_id = current_tenant_id()`.

---

## 4. Padrões de Segurança (pétreas)
- ❌ **Nunca** mandar `tenant_id` do frontend.  
- ✅ Sempre usar **anon key** no browser.  
- ✅ Policies **sempre** incluem `tenant_id = current_tenant_id()`.  
- ✅ Permissão vem do DB (**RLS + RPC**), nunca da sessão.  
- ❌ Sem duplicidade de rotas/páginas (evita double render).  
- ✅ Hooks sempre estáveis (no topo, sem condicional).  
- ❌ Nenhuma chamada direta a service-role no front.  

---

## 5. Fluxo de “Acesso Negado”
- **Usuário comum sem permissão em Gastos**:
  - `permChecked = true`, `canReadDB = false`.  
  - UI mostra inline “Acesso negado”.  
  - Nenhuma query de dados é feita.

- **Usuário admin**:
  - `canReadDB = true` → dados carregam.  
  - `canWriteDB` → controla se botões de criar/editar aparecem.

---

## 6. Pontos a Alinhar (pendentes)
- [ ] Unificar policies de Cadastros em `…registry…`.  
- [ ] Revisar policies de `other_revenues` para remover `current_role/current_can`.  
- [ ] Escolher critério único de mês para despesas (`due_date` vs `competence_month`).  
- [ ] Aplicar filtro `cost_center` 100% no server em `listExpenseEntries`.  
- [ ] Padronizar naming (`annual` vs `yearly`).  
- [ ] Revisar formatação de datas para SSR/CSR.  

---

## 7. Notas de Implementação
- `/(app)/gastos` será redirecionado para `/(app)/financeiro/gastos` para evitar duplicidade.  
- Datas → definir padrão **único** (ideal: `due_date`) e documentar.  
- `supabaseGateway` nunca engole erro → se RLS negar, o front recebe o erro cru.  

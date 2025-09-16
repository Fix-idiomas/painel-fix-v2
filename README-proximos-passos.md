# Próximos Passos — Roadmap Técnico

## 2) Próximos passos

### 2.1 Conectar audit_log nos gateways (CRUD + geração/reabertura)
- Adicionar chamadas à função/facade de auditoria em todos os métodos críticos dos gateways (ex: create, update, delete, generate, reopen).
- Exemplo: ao criar, editar ou remover um registro, registrar no audit_log o usuário, ação, payload e timestamp.
- Garantir que operações automáticas (ex: geração de mensalidades) também sejam auditadas.
- Sugestão de código:
  ```js
  await auditLog({
    user_id: session.userId,
    action: 'create_payment',
    table: 'payments',
    payload: { ...dadosInseridos },
    timestamp: new Date().toISOString(),
  });
  ```

### 2.2 Ajustar attendance e students para usar snapshots no SELECT
- Refatorar queries para buscar dados de snapshot (ex: nome do aluno, turma, professor) diretamente das colunas snapshot, evitando JOINs desnecessários com turmas.
- Garante performance, histórico imutável e menos dependência de estrutura relacional.
- Exemplo:
  ```sql
  SELECT student_name_snapshot, turma_name_snapshot, ... FROM attendance WHERE ...
  ```

### 2.3 Implementar mascaramento LGPD na UI
- Adicionar lógica de mascaramento (ex: e-mail, CPF, telefone) para usuários sem permissão explícita.
- Exemplo: mostrar “b****@gmail.com” ou “***.456.789-**” para quem não tem permissão de leitura total.
- Implementar retenção e exclusão lógica conforme política LGPD.
- Sugestão:
  ```js
  function maskEmail(email) {
    // Retorna email parcialmente mascarado
  }
  ```

### 2.4 Construir relatórios em `/relatorios`
- Criar páginas e endpoints para relatórios de assiduidade, inadimplência, etc.
- Usar queries otimizadas, respeitando RLS e snapshots.
- Permitir exportação (CSV, PDF) e filtros por período, turma, status.
- Exemplo de endpoint:
  ```js
  GET /api/relatorios/inadimplencia?tenant_id=...&mes=2025-09
  ```

### 2.5 Revisar índices de performance em tenant_id
- Garantir que todas as tabelas multi-tenant tenham índices eficientes em `tenant_id` (e, se necessário, compostos com outras colunas).
- Revisar planos de execução das queries mais pesadas.
- Ajustar ou criar índices conforme necessidade real de uso.
- Exemplo:
  ```sql
  CREATE INDEX idx_payments_tenant_id ON payments(tenant_id);
  CREATE INDEX idx_attendance_tenant_id ON attendance(tenant_id);
  ```

---

> Checklist para discussão técnica e acompanhamento de implementação.

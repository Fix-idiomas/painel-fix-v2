# Plano de Padronização de UI (Futuro)

Este documento descreve melhorias futuras de organização e consistência visual na aplicação. Nada aqui está implementado ainda – serve como referência e checklist para execução incremental.

## Objetivos
- Reduzir duplicação de código de componentes visuais recorrentes (headers, KPIs, botões).
- Garantir consistência de paleta, tipografia, espaçamento e estados (hover, focus, disabled).
- Facilitar evolução e manutenção (alterar um padrão em um ponto único).

## Escopo Inicial
1. HeaderBar reutilizável.
2. KpiCard unificado.
3. Componente Button neutro + variantes.
4. (Opcional) Paleta centralizada via CSS custom properties / config Tailwind.

---
## 1. HeaderBar Reutilizável
Padrão visto em: Mensalidades, Gastos (lançamentos e recorrentes), Categorias, seções de listagem.

### Requisitos
- Gradiente padrão: `from-[var(--fix-primary-700)] via-[var(--fix-primary-600)] to-[var(--fix-primary)]`.
- Altura: compacta (py-2). Padding horizontal consistente (px-3).
- Borda inferior: `border-b border-[color:var(--fix-primary-700)]`.
- Fonte: `font-semibold` + cor texto branco 95% (`text-white/95`).
- Suporte a: título, ações (array de nós), badge opcional, densidade (compact | normal).
- Responsividade: conteúdo quebra linha em telas pequenas sem estourar.

### API Proposta
```jsx
<HeaderBar title="Lançamentos do mês" actions={[<Button ... />, <Link ... />]} compact />
```
Props:
- `title: string | ReactNode`
- `actions?: ReactNode[]`
- `compact?: boolean` (reduz altura/padding)
- `className?: string`

### Critérios de Aceite
- Substitui todos os headers equivalentes sem perda funcional.
- Nenhum diff de lógica nos arquivos substituídos.
- Layout não quebra em largura < 360px.

### Passos
1. Criar componente em `src/components/HeaderBar.jsx`.
2. Migrar gradualmente: Gastos recorrentes, Gastos lançamentos, Mensalidades (se aplicável), Categorias.
3. Revisar cada página após migração (snapshot visual).
4. Documentar variação no README.

---
## 2. KpiCard Unificado
Atualmente há variações:
- Dashboard (`Kpi` / showBar condicional).
- Mensalidades (faixa fina + uppercase).
- Gastos (replicado padrão Mensalidades).

### Problema
Duplicação de estilos, pequenas divergências (tracking-wide, tamanhos de fonte, uso de subtitle). Evolução fica mais trabalhosa.

### Requisitos
- Faixa superior opcional (`showBar`).
- Cores baseadas em `tone`: neutral | success | warning | danger.
- Título com opção `uppercase: boolean`.
- Suporte a `subtitle` multilinha (usa `whitespace-pre-line`).
- Variação de tamanho: `size="sm|md"` (altera fonte do valor e padding).
- Estado loading opcional: skeleton ou spinner leve.

### API Proposta
```jsx
<KpiCard title="Receita total" value={fmtBRL(total)} tone="neutral" showBar uppercase />
<KpiCard title="Receita atrasada" value={fmtBRL(overdue)} tone="danger" showBar />
<KpiCard title="Alunos ativos" value={count} tone={tone} />
```

### Critérios de Aceite
- Substitui implementações locais sem alterar cálculo dos valores.
- Visual idêntico ou aprovado comparado ao baseline atual.
- Não impacta performance perceptível (render < 5ms médio por card em dev tools).

### Passos
1. Criar componente em `src/components/KpiCard.jsx`.
2. Migrar Dashboard (receitas/gastos/custos), Mensalidades, Gastos.
3. Remover componentes duplicados locais.
4. Atualizar imports e limpar código morto.
5. Teste rápido: alternar tons + verificar responsividade.

### Edge Cases
- Valor ocultado (modo "Ocultar valores"): componente deve aceitar `value="•••"` sem quebra.
- Subtitles extensos: wrap adequado sem overflow horizontal.

---
## 3. Componente Button Neutro + Variantes
Botões hoje se repetem com classes inline incoerentes (hover, tamanho, cor).

### Requisitos
- Variants: `neutral | primary | danger | subtle | ghost`.
- Sizes: `sm | md | lg`.
- Estados: `disabled`, `loading`.
- Acessibilidade: foco visível (`focus:ring-2 focus:ring-[var(--fix-primary-600)]`).
- Suporte a `as="a"` ou `Link` sem perder estilo.
- Ícones opcionais: `startIcon`, `endIcon`.

### API Proposta
```jsx
<Button variant="neutral" size="sm">Prévia / Gerar</Button>
<Button variant="primary" loading>Salvar</Button>
<Button variant="danger" onClick={onDelete}>Excluir</Button>
```

### Critérios de Aceite
- Substitui >80% dos botões existentes sem regressão visual.
- Hover/focus consistente em todos.
- Documentado no README (exemplos de variantes).

### Passos
1. Criar `src/components/Button.jsx` com mapping de variants → classes Tailwind.
2. Migrar páginas alvo: Mensalidades, Gastos (lançamentos e recorrentes), Dashboard (header), Categorias.
3. Remover botões inline redundantes.
4. Testar tabulação (navegação por teclado) e foco evidente.

### Edge Cases
- Botão usado dentro de tabela com altura reduzida → usar `size="sm"`.
- Botões consecutivos em linha (gap e wrap em mobile).

---
## 4. Paleta Unificada (Opcional)
Centralizar cores já utilizadas (vermelho primário, cinzas, verdes, amarelos) em `globals.css` usando variáveis CSS ou extender Tailwind.

### Benefícios
- Alterar tom da marca em um ponto único.
- Evitar divergência de tons próximos (ex: `rose-600` vs custom primary).

### Passos (futuros)
1. Mapear cores usadas.
2. Definir tokens (`--color-primary-700`, etc.).
3. Substituir referências diretas nas classes (quando possível) por valores custom.

---
## Ordem Recomendada de Execução
1. HeaderBar (menor risco, impacto visual rápido).
2. KpiCard unificado (reduz duplicações antes de expandir botões).
3. Button component (abrange muitas telas, fazer após estabilizar headers/KPIs).
4. Paleta/tokens (quando houver necessidade de rebrand ou ajuste de cores).

## Métricas de Sucesso
- Redução de linhas duplicadas (~20–30%).
- Tempo médio para criar novo bloco de tabela com header cai (ex: 1/3 do tempo anterior).
- Consistência visual aprovada em revisão interna (checklist design).

## Riscos e Mitigações
| Risco | Mitigação |
|-------|-----------|
| Refator grande introduz regressão | Executar em PRs pequenos e validar visualmente cada etapa |
| Over-generalização de componentes | Começar com props mínimos e expandir só quando necessário |
| Conflitos de merge | Migrar uma área por vez e comunicar dependências |

## Checklist de Conclusão (cada etapa)
- [ ] Implementação feita
- [ ] Páginas migradas
- [ ] Teste visual desktop
- [ ] Teste visual mobile
- [ ] Acessibilidade foco/teclado
- [ ] Documentação atualizada

---
## Próximos Passos Imediatos (quando iniciar)
1. Criar `HeaderBar.jsx` e migrar uma única página como piloto (Gastos recorrentes). Validar.
2. Criar `KpiCard.jsx` e migrar Dashboard (receitas) + Mensalidades. Validar.
3. Criar `Button.jsx` e migrar botões da página de Gastos. Validar.
4. Rodar revisão geral e ajustar tokens de cor se necessário.

---
## Observações
- A priorização pode mudar se surgir feature urgente; este plano é incremental.
- Evitar bloquear entrega funcional por refactors estéticos – aplicar sempre entre ciclos.
- Pode-se adotar Storybook futuramente para validar componentes isolados.

---
*Documento gerado como plano; adaptar conforme evolução do produto.*

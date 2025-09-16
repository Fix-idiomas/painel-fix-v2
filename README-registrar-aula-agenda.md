# Atalho do botão "Registrar aula" na Agenda

## Objetivo

O botão "Registrar aula" na tela de Agenda serve como um atalho para a página da turma correspondente, facilitando o acesso ao modal de criação de sessão/aula.

## Comportamento
- Ao clicar em "Registrar aula" para uma aula planejada, o usuário é redirecionado para a página `/turmas/[id]` da respectiva turma.
- Não são passados parâmetros extras na URL.
- O modal de criação de sessão deve ser aberto manualmente pelo usuário na página da turma.
- Não há alteração de estado global ou contexto.

## Exemplo de implementação do handler
```js
function goToCreateSession(ev) {
  router.push(`/turmas/${ev.turma_id}`);
}
```

## Exemplo de uso no botão
```jsx
<button
  onClick={() => goToCreateSession(ev)}
  className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
  title="Abrir página da turma"
>
  Registrar aula
</button>
```

## Observações
- Se desejar abrir o modal automaticamente ao acessar a página da turma, será necessário implementar lógica adicional (ex: parâmetro na URL ou contexto compartilhado).
- O padrão acima mantém o fluxo simples e previsível para o usuário.

# Estrutura do objeto `ev` passado para `goToCreateSession` na Agenda

## Contexto
No arquivo `src/app/(app)/agenda/page.jsx`, o botão "Registrar aula" chama:
```js
function goToCreateSession(ev) {
  router.push(`/turmas/${ev.turma_id}`);
}
```
O objeto `ev` é gerado no mapeamento dos itens da agenda (semana), podendo ser de dois tipos:

---

## 1. Sessão planejada (`type: "planned"`)

```js
{
  type: "planned",
  turma_id,        // id da turma
  turma_name,      // nome da turma
  date,            // "YYYY-MM-DD"
  time,            // "HH:mm" (da regra)
  duration_hours,  // número (ex: 0.5)
  label: "Planejada"
}
```

---

## 2. Sessão real (`type: "session"`)

```js
{
  type: "session",
  id,                // id da sessão
  turma_id,          // id da turma
  turma_name,        // nome da turma
  date,              // "YYYY-MM-DD" ou ISO completo
  duration_hours,    // número
  has_attendance,    // boolean
  label,             // "Sessão (com presença)" ou "Sessão (registrada)"
  time_from_rule,    // "HH:mm" (se não houver hora na sessão)
}
```

---

## Observação
O botão "Registrar aula" só aparece para os itens do tipo `"planned"`, então os campos garantidos em `ev` são:
- `type: "planned"`
- `turma_id`
- `turma_name`
- `date`
- `time`
- `duration_hours`
- `label: "Planejada"`

Para sessões reais, há campos extras, mas não são usados no atalho.

---

Se precisar de exemplos de uso ou integração, veja o mapeamento dos itens em `agenda/page.jsx` ou peça um exemplo detalhado.
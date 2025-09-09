# Registro de alteração: Exibição de horários planejados na Agenda

## O que foi feito

- Criado o arquivo `src/lib/agendaUtils.js` com a função utilitária `plannedSlotsForRange`, que gera slots planejados (virtuais) a partir das `meeting_rules` das turmas para um intervalo de datas.
- A função percorre as regras de horário de cada turma e gera objetos para cada ocorrência no período desejado, marcando-os como `planned: true`.
- Adicionado o import de `plannedSlotsForRange` no arquivo `agenda/page.jsx` para uso na geração dos slots planejados na Agenda.

## Como usar

- Importe a função:
  ```js
  import { plannedSlotsForRange } from "@/lib/agendaUtils";
  ```
- Use-a para gerar os horários planejados de cada turma no intervalo desejado (exemplo: semana atual):
  ```js
  let planned = turmas.flatMap(t => plannedSlotsForRange(t, weekStart, sundayISO));
  ```
- Mescle esses slots com as sessões reais para exibir todos os horários na Agenda, diferenciando visualmente os planejados dos realizados.

## Benefício

Agora a Agenda exibe todos os horários previstos pelas regras das turmas, mesmo que não haja sessões registradas, melhorando a visualização do planejamento escolar.

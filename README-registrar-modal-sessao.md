# Pontos de Integração: Atalho “Registrar aula” e Modal de Sessão

## 1. Agenda: Atalho “Registrar aula”

**Arquivo:** `src/app/(app)/agenda/page.jsx`

- O botão "Registrar aula" chama:
  ```js
  function goToCreateSession(ev) {
    router.push(`/turmas/${ev.turma_id}`);
  }
  ```
- O botão está presente na renderização dos itens da agenda:
  ```jsx
  <button
    onClick={() => goToCreateSession(ev)}
    className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
    title="Abrir criação de sessão na página da turma"
  >
    Registrar aula
  </button>
  ```
- Handler pode ser centralizado em um componente como `AgendaShell`.

## 2. Turma: Função openCreateSession

**Arquivo:** `src/app/(app)/turmas/[id]/page.jsx`

- Função que abre o modal:
  ```js
  function openCreateSession() {
    setEditingSessId(null);
    setFormSess({
      date: "",
      notes: "",
      duration_hours: String(turma?.meeting_duration_default ?? "0.5"),
    });
    // ... monta draft de presença ...
    setOpenSess(true);
  }
  ```
- O botão para abrir o modal:
  ```jsx
  <button onClick={openCreateSession} ...>+ Criar sessão</button>
  ```

### Como adicionar leitura de querystring para abrir o modal automaticamente

- Importe e use `useSearchParams` do Next.js:
  ```js
  import { useSearchParams } from "next/navigation";
  const searchParams = useSearchParams();
  ```
- Dentro de um `useEffect` ou na função, verifique se há parâmetro para abrir o modal:
  ```js
  useEffect(() => {
    if (searchParams.get("modal") === "criar") {
      openCreateSession();
    }
  }, [searchParams]);
  ```

---

**Resumo:**
- Agenda: edite o handler `goToCreateSession` e o botão em `agenda/page.jsx`.
- Turma: edite a função `openCreateSession` e adicione leitura de `useSearchParams` em `turmas/[id]/page.jsx`.
- Para abrir o modal automaticamente, use querystring `?modal=criar` e o exemplo acima.

Se quiser, copie o trecho para seu README principal ou peça para gerar um exemplo completo de integração.

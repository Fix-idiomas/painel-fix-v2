# Boas práticas de arquitetura e engenharia

Convenções adotadas no DASH. Não são preferências estéticas — cada uma existe por
um motivo (segurança multi-tenant, previsibilidade, evitar bugs já vividos). Leia
antes de abrir PR.

---

## Regras invioláveis

Segurança multi-tenant. Quebrar qualquer uma é bug de segurança, não estilo:

1. **Nunca envie `tenant_id` do frontend.** Toda tabela multi-tenant tem
   `tenant_id uuid not null default current_tenant_id()`; o banco preenche. Policies
   sempre incluem `tenant_id = current_tenant_id()`.
2. **O browser sempre usa a anon key.** A service-role key é **server-only** (rotas
   `api/admin/*`, `api/cron/*`, `api/billing/*`, `api/webhooks/asaas`). Nunca importe
   service-role em código de cliente.
3. **Permissão vem do banco (RLS + RPC), nunca do objeto de sessão.** A sessão
   carrega só dados mínimos/UI. Não decida autorização a partir de um campo de
   `useSession`.
4. **Gateways nunca engolem erro.** Se a RLS negar, a UI recebe o erro/vazio cru —
   não um resultado "corrigido". Silenciar erro esconde falha de permissão.
5. **Sem rotas/páginas duplicadas** (evita double render). **Hooks estáveis**: no
   topo do componente, sem condicional.
6. **Nunca chame `supabase.auth.*` dentro de `onAuthStateChange`** (ver [auth-lock](#o-auth-lock)).

---

## Arquitetura em camadas

- Fluxo único: **página → `financeGateway` → domain gateway → Supabase (anon)**. A UI
  não fala com o Supabase direto.
- **Código novo importa o domain gateway diretamente** (`@/lib/gateways/turmaGateway`),
  não o barrel `supabaseGateway`.
- **Gateways transportam, não decidem.** Normalização leve (status, `cost_center`,
  shape `{ rows, kpis }`) é ok; regra de negócio de autorização é do banco.
- **Rotas de servidor** (`api/*`) usam cliente server-side, **recheck** de tenant +
  permissão via RPC, e só então service-role quando precisam ser cross-tenant.

### Ponto único de leitura para contratos frágeis

Quando várias telas leem a mesma estrutura, **centralize a leitura em um helper puro
e testado**. Exemplo real: `getCombinedRevenueKpis` retorna
`{ total, received, upcoming, overdue }` (inglês). Três telas liam
`recebido/a_receber/atrasado` → tudo `undefined` → gráfico de receita vazio e KPIs
zerados. Correção: [`src/lib/revenueKpis.ts`](../src/lib/revenueKpis.ts)
(`readCombinedRevenue`) é o único ponto de leitura, com teste de regressão que quebra
o CI se a chave divergir. **Lição:** contrato repetido em N telas = 1 helper + 1 teste.

### Extraia funções puras testáveis das páginas

Helpers de lógica embutidos em `.jsx` (não exportados) não têm como ser testados.
Extraia para `src/lib/*` e exporte. Exemplos: `src/lib/sessionDisplay.ts`
(`spYearMonth`, `fmtSessionDateWithRules`, `buildTodayClasses`),
`src/lib/agendaEvents.ts`. Mantenha o comportamento idêntico ao extrair.

---

## Segurança / RLS

O modelo completo (isolamento, papéis, escopo por professor, titularidade,
PERMISSIVE vs RESTRICTIVE, como validar RLS por simulação SQL) está em
[SECURITY.md](SECURITY.md) — **leia antes de mexer em qualquer policy.** Os dois
pontos que mais causam bug:

- **⚠️ Footgun do `row_security` em `SECURITY DEFINER`:** para desligar RLS dentro da
  função, use a cláusula de cabeçalho `SET row_security TO 'off'` (escopo da função,
  restaurado automático). **Nunca** `perform set_config('row_security','off', true)` no
  corpo — o `true` é escopo de **transação** e vaza para o resto dela (vazamento entre
  tenants). Ver `db/migrations/20260706_fix_row_security_leak.sql`.
- **Titularidade (owner):** o bootstrap grava `tenants.owner_user_id` e insere claim
  `role='admin'` — o check constraint só permite `admin`/`user`, **nunca** `owner`
  como role de claim.

---

## O auth-lock

**NUNCA** chame `supabase.auth.*` (`getUser`/`getSession`/`getClaims`…) **diretamente
dentro** de um callback de `supabase.auth.onAuthStateChange`. O callback roda
segurando o cadeado interno do token; chamar um método de auth que também precisa do
cadeado causa **deadlock** no `TOKEN_REFRESHED` — a sessão trava em "Preparando
sessão…" e leituras/escritas caem junto.

**Sempre adie** com `setTimeout(() => { ... }, 0)` para liberar o cadeado antes.
Vale para `SessionContext.jsx`, `src/lib/subscription.js` (`useSubscription`) e
qualquer novo assinante de `onAuthStateChange`.

> Testes automatizados **não** pegam isto (é timing de runtime). Valide no navegador
> com sessão real ao longo do tempo (esperar o refresh do token disparar).

---

## Tratamento de erro

- Use `mapErr(context, error)` de `gateways/helpers.ts` para traduzir erros do
  Postgres em mensagens pt-BR amigáveis (ex.: `42501`/RLS → "Você não tem
  permissão…"), **mantendo** o `console.error` cru para debug. Não invente
  tratamento novo por gateway.
- **Não** transforme erro em resultado válido. Propague — a UI decide como exibir.

---

## Fuso horário

- A escola opera em **`America/Sao_Paulo`** (UTC-3, **sem** horário de verão desde
  2019). Datas de sessão são `timestamptz`.
- Use os helpers de `gateways/helpers.ts` (`tzToday`, `monthStartOf`, `toIsoTz`).
  Cuidado: `toIsoTz("YYYY-MM-DDTHH:MM")` interpreta como **hora local do runtime** (no
  navegador = SP); em teste, fixe `process.env.TZ = "America/Sao_Paulo"`.
- Para "ano-mês" a partir de um `timestamptz`, use fuso explícito (`spYearMonth` usa
  `Intl` com `timeZone`) — senão uma aula noturna do dia 31 cai no mês errado.

---

## Testes

- **Vitest**, ambiente node, Supabase **mockado**. `npm test` (one-shot) /
  `npm run test:watch`.
- Testes de gateway em `src/lib/gateways/__tests__/` usando
  [`supabaseMock.ts`](../src/lib/gateways/__tests__/supabaseMock.ts); testes de libs
  puras em `src/lib/__tests__/`.
- **Rode `npm test` antes de submeter** mudanças em gateways ou finanças.

### O mock do Supabase

`createSupabaseMock()` devolve um cliente chainable. Recursos:

- `mock._result` — resultado global padrão `{ data, error }`.
- `mock._tableResults[table]` — resultado **por tabela**. Pode ser um objeto (usado em
  toda query da tabela) **ou um array/fila** (cada query terminal consome o próximo; o
  último repete). Útil quando a mesma tabela é consultada em sequência com resultados
  diferentes (ex.: `select` → `insert` → retry).
- `mock._rpcResults[fn]` — resultado por RPC.
- `mock._calls` — grava cada método chamado `{ table, method, args }` para asserção de
  payload (ex.: o que foi passado ao `.upsert()`).
- `mock._consumed` — contador das filas. **Resete no `beforeEach`** junto com
  `_tableResults`/`_calls`, senão o índice vaza entre testes.

**Limite conhecido:** o mock ignora os *argumentos* de `.eq()/.in()/.gte()` — ele
devolve o resultado por tabela independentemente do filtro. Ou seja, os testes
validam a **matemática de agregação**, não a **corretude da query**. Para pegar
"passei os ids errados ao `.in()`", asserte em `mock._calls`.

**O que o harness NÃO cobre:** RLS (precisa de Postgres real — validamos por simulação
SQL, ver [SECURITY.md](SECURITY.md)), componentes `.jsx` (sem jsdom/RTL), o auth-lock
(timing de runtime), e concorrência/row-lock.

---

## Processo de validação (antes de declarar "pronto")

Para qualquer modificação não-trivial, **não basta `tsc` + testes**. Rode em paralelo,
via subagentes, três revisões sobre o diff e consolide os achados **antes** de fechar
ou commitar:

- **QA** — revisão geral + cobertura de testes real e significativa; casos de borda;
  outras telas/consumidores afetados.
- **Senior engineer** — code review do diff: correção, regressões, convenções,
  segurança/RLS, camadas.
- **UX** — experiência das telas afetadas: empty states, rótulos, tooltips, fluxo.

Escale o esforço ao tamanho da mudança, mas rode os três por padrão. Corrija o que for
válido; só então declare pronto.

Portões objetivos que devem passar em toda mudança relevante:

```bash
npx tsc --noEmit     # tipos
npm test             # vitest
npm run build        # compila todas as páginas (pega erro de JSX)
```

---

## Migrations e verificação de banco

- Toda mudança de schema/RLS/RPC vira uma migration datada em `db/migrations/`
  (`YYYYMMDD_descricao.sql`). Idempotente quando possível. Ver
  [DATABASE.md](DATABASE.md).
- **Fluxo:** aplicar no Supabase → **verificar** → **commitar** a migration. A
  migration versionada é a fonte da verdade; não deixe o banco à frente do repo.
- Para invariantes críticas, adicione um **script de verificação read-only** em
  `db/verify/` que falha (`RAISE EXCEPTION`) se a regressão voltar. Exemplo:
  `db/verify/bootstrap_tenant_and_admin.verify.sql`.
- `execute_sql` (MCP Supabase) é **autocommit** e `RAISE` **não** desfaz DDL — para
  testar com rollback, use um único bloco `DO $$ ... $$` que faz o trabalho, asserta e
  dá `RAISE EXCEPTION` no fim (aborta e desfaz tudo).
- **Backfill de dados:** genérico e idempotente (só toque o que precisa, ex.:
  `WHERE col IS NULL`). Não hardcode IDs gerados.

---

## Git e commits

- **Não commite/push/merge sem OK explícito** do dono do repo.
- Autoria dos commits: `viniciuspenteado <vinicius_penteado@hotmail.com>`.
- Mensagens claras (o *porquê*, não só o *o quê*). Mudança de DB → cite a migration.
- Nunca commite segredos. `.env*` é gitignored.

---

## Convenções de código

- **Idioma:** strings de UI, comentários e mensagens de erro em **pt-BR**.
- **Tipo de arquivo:** componentes são `.jsx`; libs e rotas de API são majoritariamente
  `.ts`. Siga o que já existe na área que você toca (`.ts/.tsx` e `.js/.jsx` convivem).
- **Dinheiro** é BRL; datas seguem o padrão de fuso acima.
- Mantenha a documentação em `docs/` sincronizada com a mudança **no mesmo PR**.

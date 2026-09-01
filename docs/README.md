# Documentação — Painel Fix v2 (DASH)

Hub de documentação do projeto. **Comece por aqui** se você é novo no código.

> **DASH / Painel Fix v2** é um SaaS web multi-tenant para gestão de escolas de
> idiomas (Fix-Idiomas): cadastro (alunos, professores, turmas, pagadores),
> financeiro (mensalidades, despesas, outras receitas), agenda/presença,
> relatórios, insights de IA por aluno e cobrança de assinatura (Asaas).
> Idioma de domínio e UI: **português (pt-BR)**.

## Ordem de leitura sugerida (novo desenvolvedor)

1. **[DEVELOPMENT.md](DEVELOPMENT.md)** — como rodar o projeto: pré-requisitos,
   variáveis de ambiente, comandos, testes, deploy e troubleshooting.
2. **[ARCHITECTURE.md](ARCHITECTURE.md)** — visão geral: camadas, fluxo de dados,
   rotas, módulos, sessão/permissões, fuso horário. **O mapa do território.**
3. **[SECURITY.md](SECURITY.md)** — o modelo multi-tenant (RLS): isolamento por
   tenant, papéis, escopo por professor, titularidade (owner), entitlement/paywall
   e os *footguns* de `SECURITY DEFINER` / `row_security`. **Leia antes de mexer em RLS.**
4. **[BEST_PRACTICES.md](BEST_PRACTICES.md)** — boas práticas de arquitetura e
   engenharia adotadas aqui: regras invioláveis, padrões de camada, testes,
   processo de validação e armadilhas conhecidas. **Leia antes de abrir PR.**
5. **[DATABASE.md](DATABASE.md)** — banco: fluxo de migrations, catálogo de RPCs,
   scripts de verificação, crons e tabelas principais.

## Referência rápida

| Preciso… | Vá para |
|---|---|
| Rodar localmente / variáveis de ambiente | [DEVELOPMENT.md](DEVELOPMENT.md) |
| Entender o fluxo de dados (page → gateway → DB) | [ARCHITECTURE.md](ARCHITECTURE.md#camadas) |
| Adicionar/alterar uma policy RLS | [SECURITY.md](SECURITY.md) |
| Criar uma migration | [DATABASE.md](DATABASE.md#fluxo-de-migrations) |
| Saber as regras que **não** posso quebrar | [BEST_PRACTICES.md](BEST_PRACTICES.md#regras-invioláveis) |
| Entender billing/Asaas | [ARCHITECTURE.md](ARCHITECTURE.md#billing-assinatura-asaas) + `docs/prd/` |
| Ver o que está adiado (dívida técnica) | [TECH_DEBT.md](TECH_DEBT.md) |

## Outros documentos

- **[TECH_DEBT.md](TECH_DEBT.md)** — itens conhecidos e deliberadamente adiados.
- **[prd/](prd/)** — PRDs de billing/assinatura (entitlement, Asaas, UI).
- **[migrations/](migrations/)** — notas de migrations específicas.
- **`/CLAUDE.md`** (raiz) — guia condensado para agentes de IA que trabalham no repo.
- **`/README.md`** (raiz) — landing page do projeto.

> Docs de área na raiz (`README_INTEGRACOES.md`, `README_AUDIT_GASTOS.md`,
> `README_SUPABASE_AUDIT.md`, `README_FOTOS_ALUNOS.md`, `README_UI_PLAN.md`) são
> aprofundamentos históricos por tema. `README_ARQUITETURA.md` foi **substituído**
> por [ARCHITECTURE.md](ARCHITECTURE.md).

## Manutenção desta documentação

Docs desatualizadas são piores que ausência de docs. Ao mudar arquitetura,
convenções, RLS, variáveis de ambiente ou fluxo de dados, **atualize o doc
correspondente no mesmo PR**. Se um comportamento descrito aqui mudar, corrija o
texto — não deixe para depois.

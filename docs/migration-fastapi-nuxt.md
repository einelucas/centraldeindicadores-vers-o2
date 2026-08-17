# Migração para FastAPI, Nuxt e Vue

## Por que este documento existe

A Central de Indicadores está funcionalmente pronta (RDO, IDP, RNC, 5S, Taxa de
Acidentes e Scorecard 2026, todos com importação, cálculo, publicação e
painel). O passo seguinte é a possível integração ao hub corporativo de
automação ("Automação Industrial"), cuja stack padrão é **Nuxt/Vue** no
frontend e **FastAPI (Python)** no backend. O time de automação é quem
executa essa refatoração; este documento é o guia de referência para esse
trabalho — diagnóstico do estado atual, decisões de arquitetura e ordem de
migração sugerida.

Não há, até o momento, uma decisão formal de iniciar a migração. O código do
hub (`backend/`, `frontend/`) não existe neste repositório; este é um plano,
não um patch aplicado.

## O que já foi feito para reduzir o trabalho de migração

Durante o desenvolvimento, a identidade visual da aplicação foi
deliberadamente alinhada à do hub (mesmo cabeçalho com abas por ícone, mesma
barra de ferramentas separada do cabeçalho, mesma hierarquia de cartão do
indicador com subcartões, mesmo padrão de exportação em PDF por painel), para
que a futura recriação em Nuxt seja principalmente uma **porta de
componentes**, não um redesenho:

- os ícones já vêm de `lucide-react`, que tem equivalente direto em Vue
  (`lucide-vue-next`) com o mesmo nome de ícone e as mesmas props;
- os componentes de UI seguem o padrão shadcn/ui (tokens HSL em
  `globals.css`, `class-variance-authority`, `clsx` + `tailwind-merge`),
  que também tem uma porta oficial para Vue (`shadcn-vue`) usando os mesmos
  tokens de cor e a mesma folha `tailwind.config`;
- a divisão "cabeçalho fixo + abas por ícone + `ToolbarSlot`" (contexto React
  + `createPortal` em `src/components/layout/ToolbarSlot.tsx`) mapeia
  diretamente para `provide`/`inject` + `<Teleport>` no Vue — o mesmo
  problema (um botão de ação definido dentro da página mas renderizado dentro
  do container de ícones do cabeçalho) tem solução equivalente nas duas
  stacks;
- a exportação em PDF (`src/lib/exports/panel-screenshot-pdf.ts`) usa
  `html2canvas` + `jsPDF` sobre uma `ref` de DOM — nenhuma API é específica de
  React; a mesma lógica funciona em Vue trocando `useRef`/`useCallback` por
  `ref()`/uma function comum.

Ou seja: o trabalho de "como isso deve parecer" já está resolvido no
Next.js atual e pode ser copiado; o que resta para a migração é a troca de
framework e de linguagem de backend.

## Diagnóstico do projeto atual

| Métrica | Valor |
|---|---:|
| Arquivos TypeScript/TSX em `src/` | 180 |
| Rotas de API (`route.ts`) | 33 |
| Modelos Prisma | 20 |
| Páginas (`page.tsx`) | 14 |
| Arquivos de teste (unit + integração + e2e) | 36 |

Os cálculos, importadores, serviços, repositórios e componentes ficam
separados dentro de `src/features/<modulo>`, um por indicador, seguindo
sempre a mesma subdivisão (`calculations/`, `components/`, `importers/`,
`publications/`, `repositories/`, `schemas/`, `services/`, `types/`,
`utils/`). Essa separação já é favorável à migração: cada pasta de módulo
mapeia para um módulo equivalente em `app/modules/<indicador>/` no FastAPI.

O escopo funcional atual, confirmado no `README.md` da raiz, é:

1. Aprovação de RDO;
2. IDP — aderência ao cronograma;
3. RNC;
4. 5S;
5. Taxa de acidentes;
6. Scorecard 2026 e Painel Geral.

Não há mais código de IDC, Treinamentos, NEJ ou Taxa de Desligamento no
projeto — esse escopo já foi removido do repositório atual e não precisa ser
considerado na migração.

## Decisão de arquitetura

A migração será incremental, mantendo o Next.js atual disponível até cada
módulo alcançar paridade funcional e de cálculo.

```text
frontend/ (Nuxt 4 + Vue 3)
        |
        | HTTP / JSON
        v
backend/ (FastAPI + Pydantic)
        |
        | SQLAlchemy assíncrono
        v
PostgreSQL existente (Neon ou servidor corporativo)
```

### Backend

- FastAPI para as rotas HTTP;
- Pydantic para contratos e validação;
- SQLAlchemy assíncrono para persistência;
- Alembic para migrations futuras;
- pytest para cálculos e APIs;
- arquitetura por módulos, mantendo a separação atual.

Estrutura prevista para cada indicador:

```text
app/modules/rdo/
├── models.py
├── schemas.py
├── repository.py
├── calculations.py
├── service.py
└── router.py
```

### Frontend

- Nuxt 4 com Vue 3 e TypeScript;
- `shadcn-vue` + `lucide-vue-next`, reaproveitando os mesmos tokens de cor de
  `globals.css` e o mesmo `tailwind.config` (adaptado para o preset do Nuxt);
- páginas em `app/pages`, espelhando as rotas atuais de `src/app/(dashboard)`;
- layouts e componentes compartilhados — `AppHeader`, `TabsNav`,
  `ModuleWorkspace` e `ToolbarSlot` têm porte direto para componentes/
  composables Vue equivalentes;
- composables para acesso à API (substituindo os `fetch` client-side atuais);
- stores (Pinia) somente quando existir estado compartilhado real;
- gráficos: Recharts não tem porte para Vue; avaliar `vue-chartjs` ou
  `unovis` no momento de cada módulo, mantendo os mesmos dados de entrada e a
  mesma paleta categórica já validada (`BLUE`/`GOLD`/`GREEN`/`RED`/`GRAY`
  usados nos painéis atuais);
- exportação em PDF: reaproveitar a mesma estratégia de screenshot
  (`html2canvas` + `jsPDF`) descrita acima.

## Banco de dados

O banco atual será preservado. A primeira fase não executa `alembic upgrade`,
`prisma db push` nem qualquer alteração estrutural.

Ordem segura:

1. conectar o FastAPI ao banco existente somente para leitura;
2. introspectar as tabelas reais;
3. mapear nomes e tipos do Prisma para SQLAlchemy;
4. comparar o resultado com `prisma/schema.prisma`;
5. criar um baseline Alembic sem recriar tabelas;
6. liberar escrita apenas depois dos testes de paridade.

Como o Prisma usa nomes de modelos como `User`, `IndicatorPublication` e
`RdoRecord`, o SQLAlchemy deverá mapear explicitamente os nomes e a
capitalização das tabelas existentes.

## Autenticação

A autenticação atual usa Better Auth e tabelas `User`, `Session` e `Account`.
Ela é uma das partes mais acopladas ao Next.js. A decisão já tomada é
substituí-la por **Keycloak** (com Microsoft Entra ID configurado dentro
dele) em vez de um SSO genérico. A migração deve ocorrer em duas etapas:

1. FastAPI reconhece temporariamente as sessões existentes ou recebe chamadas
   por um proxy controlado;
2. depois, a autenticação passa a validar tokens OIDC emitidos pelo Keycloak,
   mantendo os perfis `VIEWER`, `ANALYST` e `ADMIN`.

`src/server/auth/provider.ts` define a interface `AuthenticationProvider`,
mas **não está conectada ao fluxo real** hoje — não subestime o esforço achando
que basta implementá-la. O modelo `User` já tem os campos `authProvider` e
`externalUserId` preparados para login federado. Consulte
[`migration-authentication-keycloak.md`](migration-authentication-keycloak.md)
para o plano completo (arquivos a trocar, fluxo OIDC, JWKS, provisionamento
JIT, variáveis de ambiente e fases) — ele independe de o backend ser Next.js
ou FastAPI, mas assume que o corte definitivo acontece na stack Nuxt/FastAPI
(ver seção 9 daquele documento).

Nenhuma rota de negócio deve ser publicada sem autorização no servidor.

## Pontos críticos que precisam de testes de paridade

- chaves de negócio e `contentHash` das importações;
- deduplicação e atualização incremental;
- processamento por lotes;
- snapshots imutáveis em `IndicatorPublication`;
- diferença entre resultado administrativo e resultado publicado;
- regras mensais e semestrais;
- scorecard total de 11.582 pontos;
- conversões entre fração, percentual e dias;
- exportações Excel/PDF;
- permissões e auditoria.

## Ordem de migração

### Fase 0 — identidade visual (já concluída no Next.js atual)

O cabeçalho, as abas por ícone, a barra de ferramentas e a hierarquia de
cartão/subcartão dos painéis já foram redesenhados para corresponder ao hub.
Esse trabalho serve como referência visual pronta para a implementação Nuxt —
não precisa ser refeito, apenas portado.

### Fase 1 — fundação

- projeto FastAPI executável;
- conexão assíncrona opcional com PostgreSQL;
- endpoints de saúde;
- mapa de módulos;
- projeto Nuxt executável;
- tela inicial consumindo o FastAPI, já usando o cabeçalho/abas portados da
  Fase 0.

### Fase 2 — Scorecard em leitura

O Scorecard será o primeiro fluxo de negócio porque consolida os demais
módulos e permite validar contratos de resposta, publicação e formatação sem
começar pelas importações mais complexas.

Entregáveis:

- modelos SQLAlchemy mínimos para `IndicatorPublication` e
  `ScorecardSnapshot`;
- leitura das publicações ativas;
- cálculo Python equivalente ao TypeScript;
- endpoint `GET /api/v1/scorecard`;
- tela Nuxt com mês, valores, metas e pontos, reaproveitando o layout de
  `DashboardOverview.tsx` (cartões de legenda, cores por faixa setorial);
- testes comparando resultados TypeScript e Python.

### Fase 3 — RDO completo

O RDO deve ser o primeiro módulo completo por ser a referência arquitetural
do projeto atual.

- importação;
- validação;
- deduplicação;
- cálculo;
- publicação;
- histórico;
- painel (reaproveitando a hierarquia cartão/subcartão de
  `RdoPublishedPanel.tsx`);
- exportação em PDF;
- auditoria.

### Fases seguintes

1. IDP;
2. RNC;
3. 5S;
4. Taxa de acidentes;
5. administração, usuários, configurações e auditoria;
6. desligamento definitivo do Next.js.

## Como aplicar este patch

Quando a migração for iniciada, extrair o conteúdo na raiz do projeto,
adicionando somente:

```text
backend/
frontend/
```

O código Next.js existente não deve ser alterado até que cada módulo migrado
alcance paridade e seja validado.

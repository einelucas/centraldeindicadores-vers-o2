# Migração para FastAPI, Nuxt e Vue

## Diagnóstico do projeto atual

A aplicação atual já possui uma divisão por domínio favorável à migração. No
arquivo analisado existem 215 arquivos TypeScript/TSX, 42 rotas de API, 27
modelos Prisma, 19 páginas e 58 arquivos de teste. Os cálculos, importadores,
serviços, repositórios e componentes ficam separados dentro de `src/features`.

O escopo funcional atual informado no README do repositório é:

1. Aprovação de RDO;
2. IDP — aderência ao cronograma;
3. RNC;
4. 5S;
5. Taxa de acidentes;
6. Scorecard 2026 e Painel Geral.

O arquivo local ainda contém código de IDC, Treinamentos, NEJ e Taxa de
Desligamento. Esses diretórios não devem ser migrados sem uma nova confirmação
de escopo. Durante a transição, eles podem permanecer no projeto antigo para
não gerar uma remoção arriscada.

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
- páginas em `app/pages`;
- layouts e componentes compartilhados;
- composables para acesso à API;
- stores somente quando existir estado compartilhado real;
- gráficos e exportações adicionados durante a migração de cada módulo.

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
`RdoRecord`, o SQLAlchemy deverá mapear explicitamente os nomes e a capitalização
das tabelas existentes.

## Autenticação

A autenticação atual usa Better Auth e tabelas `User`, `Session` e `Account`.
Ela é uma das partes mais acopladas ao Next.js. A migração deve ocorrer em duas
etapas:

1. FastAPI reconhece temporariamente as sessões existentes ou recebe chamadas
   por um proxy controlado;
2. depois, a autenticação passa para um provedor próprio/corporativo, mantendo
   os perfis `VIEWER`, `ANALYST` e `ADMIN`.

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

### Fase 1 — fundação

Entregue neste patch:

- projeto FastAPI executável;
- conexão assíncrona opcional com PostgreSQL;
- endpoints de saúde;
- mapa de módulos;
- projeto Nuxt executável;
- tela inicial consumindo o FastAPI.

### Fase 2 — Scorecard em leitura

O Scorecard será o primeiro fluxo de negócio porque consolida os demais módulos
e permite validar contratos de resposta, publicação e formatação sem começar
pelas importações mais complexas.

Entregáveis:

- modelos SQLAlchemy mínimos para `IndicatorPublication` e `ScorecardSnapshot`;
- leitura das publicações ativas;
- cálculo Python equivalente ao TypeScript;
- endpoint `GET /api/v1/scorecard`;
- tela Nuxt com mês, valores, metas e pontos;
- testes comparando resultados TypeScript e Python.

### Fase 3 — RDO completo

O RDO deve ser o primeiro módulo completo por ser a referência arquitetural do
projeto atual.

- importação;
- validação;
- deduplicação;
- cálculo;
- publicação;
- histórico;
- painel;
- exportação;
- auditoria.

### Fases seguintes

1. IDP;
2. RNC;
3. 5S;
4. Taxa de acidentes;
5. administração, usuários, configurações e auditoria;
6. desligamento definitivo do Next.js.

## Como aplicar este patch

Extraia o conteúdo na raiz do projeto. Ele adiciona somente:

```text
backend/
frontend/
docs/migration-fastapi-nuxt.md
```

O código Next.js existente não é alterado.

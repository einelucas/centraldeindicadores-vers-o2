# Visão geral do sistema

A Central de Indicadores reúne cinco indicadores operacionais e o Scorecard 2026 em uma aplicação Next.js com PostgreSQL e Prisma.

## Fluxo

1. O analista importa ou informa os dados do módulo.
2. O servidor valida e persiste os registros.
3. O módulo calcula os resultados administrativos.
4. Um usuário autorizado publica um snapshot.
5. O Painel Geral e o Scorecard leem somente publicações ativas.

## Módulos ativos

- RDO;
- IDP — Aderência Cronograma;
- RNC;
- 5S;
- Taxa de Acidentes.

## Organização

```text
src/features/<modulo>/
├── calculations/
├── components/
├── importers/
├── publications/
├── repositories/
├── schemas/
├── services/
├── types/
└── utils/
```

A área administrativa concentra importações, usuários, auditoria e configurações.

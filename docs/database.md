# Banco de dados

O projeto utiliza PostgreSQL com Prisma.

## Estruturas principais

- `User`, `Session`, `Account` e `Verification` — autenticação e perfis (Better Auth).
- `ImportJob`, `ImportBatch` e `ImportError` — rastreio das importações.
- `IndicatorResult` — resultados consolidados por módulo, indicador, unidade, ano e mês.
- `IndicatorPublication` — snapshots versionados exibidos nos painéis.
- `IndicatorJustification` — justificativas de exclusões/ajustes por indicador (`/api/justificativas`).
- `RdoRecord`, `IdpRsoRecord`, `RncRecord` e `FiveSRecord` — registros importados dos módulos ativos. `IdpRecord` também existe no schema (linha de base/custo por disciplina), mas não tem nenhum uso no código atual — `IdpRsoRecord` (por RSO) é o modelo que o cálculo do IDP realmente usa.
- `AccidentMonthlyRecord` e `AccidentUnitRecord` — dados da Taxa de Acidentes (sem importação por planilha; lançamento manual via `/api/taxa-acidentes`).
- `ScorecardSnapshot` — valores mensais consolidados do ciclo (`year`/`month`; nunca um ajuste manual, ver `scorecard-2026.md`).
- `AppSetting` — metas, listas de exclusão e o período de controle do Scorecard.
- `AuditLog` — trilha de alterações.

## Configurações oficiais

| Chave | Valor padrão |
|---|---:|
| `rdo.target` | 0,80 |
| `idp.target` | 0,90 |
| `rnc.maxPrazoDias` | 15 |
| `fiveS.target` | 0,90 |
| `fiveS.excludedUnits` | SP, CSC |
| `taxa-acidentes.target` | 7,5 |

## Comandos

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:deploy
pnpm db:seed
pnpm db:studio
```

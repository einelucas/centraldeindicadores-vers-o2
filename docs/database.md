# Banco de dados

O projeto utiliza PostgreSQL com Prisma.

## Estruturas principais

- `User`, `Session`, `Account` e `Verification` — autenticação e perfis.
- `ImportJob`, `ImportBatch` e `ImportError` — rastreio das importações.
- `IndicatorResult` — resultados consolidados por módulo, indicador, unidade, ano e mês.
- `IndicatorPublication` — snapshots versionados exibidos nos painéis.
- `RdoRecord`, `IdpRecord`, `RncRecord` e `FiveSRecord` — registros importados dos módulos ativos.
- `AccidentMonthlyRecord` e `AccidentUnitRecord` — dados da Taxa de Acidentes.
- `ScorecardSnapshot` — valores mensais consolidados do ciclo.
- `AppSetting` — metas e listas de exclusão.
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

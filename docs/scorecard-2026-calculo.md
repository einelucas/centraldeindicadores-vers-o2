# Cálculo de pontos — Scorecard 2026

## Estrutura do ciclo

- Pontuação máxima: **11.582 pontos**.
- Meses considerados: **junho, julho, agosto, setembro, outubro e novembro**.
- Pontuação máxima por mês: **1.930,333333 pontos**.

```text
pontos_mensais = 11.582 / 6
pontos_possiveis_indicador = pontos_mensais × (peso / 100)
pontos_realizados_indicador = meta_cumprida ? pontos_possiveis_indicador : 0
```

## Distribuição mensal

| Indicador | Área | Peso | Pontos possíveis/mês | Meta |
|---|---|---:|---:|---:|
| Aprovação RDO | Obras | 25,00% | 482,583333 | ≥ 80% |
| Aderência Cronograma (IDP) | Planejamento | 35,00% | 675,616667 | ≥ 90% |
| RNC | Conformidade de Obra | 10,00% | 193,033333 | ≤ 15 dias |
| 5S | Qualidade | 10,00% | 193,033333 | ≥ 90% |
| Taxa de Acidentes | Segurança | 20,00% | 386,066667 | ≤ 7,5 |
| **Total mensal** | — | **100,00%** | **1.930,333333** | — |

## Regras

- A pontuação é binária: meta cumprida recebe toda a parcela; caso contrário, recebe zero.
- Resultado ausente recebe zero ponto.
- Os cálculos mantêm precisão decimal; o arredondamento ocorre somente na exibição e exportação.
- A soma máxima do ciclo permanece em 11.582 pontos.

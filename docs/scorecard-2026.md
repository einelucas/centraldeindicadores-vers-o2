# Scorecard 2026

## Período

O ciclo é sempre um semestre, escolhido pelo seletor de Ano + Semestre (o
mesmo padrão travado usado pelos demais painéis administrativos — RDO, IDP,
RNC, 5S e Taxa de Acidentes):

- **S2**: junho a novembro do ano selecionado;
- **S1**: dezembro do ano selecionado a maio do ano seguinte.

Não existe mais um filtro livre de "De/Até" para o Scorecard: o período do
ciclo (usado tanto pela leitura administrativa quanto pelo Painel Geral) é
sempre um desses dois semestres inteiros. Ver `cycleFromYearSemester` em
`src/components/layout/useReadingContextCycle.ts`.

## Pontuação

```text
pontuação máxima do ciclo = 11.582
pontuação máxima mensal = 11.582 / 6
pontos possíveis do indicador = pontuação mensal × peso percentual
pontos realizados = meta cumprida ? pontos possíveis : 0
```

| Indicador | Peso | Meta |
|---|---:|---:|
| Aprovação RDO | 25,00% | ≥ 80% |
| Aderência Cronograma (IDP) | 35,00% | ≥ 90% |
| RNC | 10,00% | ≤ 15 dias |
| 5S | 10,00% | ≥ 90% |
| Taxa de Acidentes | 20,00% | ≤ 7,5 |
| **Total** | **100,00%** | — |

Indicadores do tipo maior ou igual atendem quando `resultado >= meta`. Indicadores do tipo menor ou igual atendem quando `resultado <= meta`.

Um valor ausente aparece como sem dado e recebe zero ponto. Os pontos permanecem com precisão decimal durante toda a soma.

O Painel Geral utiliza somente snapshots publicados e mantém a pontuação prevista em 11.582 pontos para o ciclo completo.

## Origem dos valores e edição manual

O painel de Administração do Scorecard **não tem nenhuma edição manual**:
não há mais campo de ajuste por indicador nem clique-para-editar no histórico
do ciclo. Cada valor exibido é sempre um destes dois, nunca digitado por um
usuário:

1. o valor ao vivo publicado pelo módulo de origem (RDO/IDP/RNC/5S/Taxa de
   Acidentes) para aquele mês; ou
2. o último snapshot salvo em `ScorecardSnapshot` via "Salvar snapshot" —
   que grava o valor ao vivo do momento do clique, não um ajuste manual.

O valor ao vivo sempre prevalece sobre o snapshot salvo quando os dois
existem para o mesmo indicador/mês; o snapshot só é usado como respaldo
quando não há valor ao vivo disponível (ex.: módulo retratado, sem
publicação ativa). Essa regra vive em `effectiveByPeriod` em
`src/features/scorecard/components/ScorecardView.tsx`.

O botão "Limpar histórico do ciclo" (somente ADMIN) apaga os snapshots
salvos do ciclo selecionado; os dados publicados nos módulos de origem não
são afetados e continuam disponíveis na leitura ao vivo.

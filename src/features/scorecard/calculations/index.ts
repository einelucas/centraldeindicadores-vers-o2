/** Cálculos puros do Scorecard 2026. */
import {
  SC_INDICATORS,
  SCORECARD_MONTHLY_POOL,
  type ScorecardIndicator,
  type ScorecardResult,
  type ScorecardRow,
} from "@/features/scorecard/types";

/** Pontos mensais disponíveis para um indicador conforme seu peso. */
export function indicatorMonthlyPoints(indicator: ScorecardIndicator): number {
  return (indicator.peso / 100) * SCORECARD_MONTHLY_POOL;
}

/** Avalia um indicador e aplica a regra binária da planilha. */
export function scoreIndicator(
  indicator: ScorecardIndicator,
  value: number | null | undefined,
): {
  pass: boolean;
  pontos: number;
  pontosPossiveis: number;
  hasValue: boolean;
} {
  const pontosPossiveis = indicatorMonthlyPoints(indicator);

  if (value === null || value === undefined || !Number.isFinite(value)) {
    return {
      pass: false,
      pontos: 0,
      pontosPossiveis,
      hasValue: false,
    };
  }

  const pass =
    indicator.direction === "higher"
      ? value >= indicator.meta
      : value <= indicator.meta;

  return {
    pass,
    pontos: pass ? pontosPossiveis : 0,
    pontosPossiveis,
    hasValue: true,
  };
}

/** Consolida os cinco indicadores para um mês. */
export function computeScorecard(
  values: Record<string, number | null | undefined>,
  indicators: readonly ScorecardIndicator[] = SC_INDICATORS,
): ScorecardResult {
  const rows: ScorecardRow[] = indicators.map((indicator) => {
    const value = values[indicator.key];
    const scored = scoreIndicator(indicator, value);

    return {
      key: indicator.key,
      label: indicator.label,
      peso: indicator.peso,
      meta: indicator.meta,
      direction: indicator.direction,
      unit: indicator.unit,
      value:
        value === null || value === undefined || !Number.isFinite(value)
          ? null
          : value,
      ...scored,
    };
  });

  const totalPontos = rows.reduce((sum, row) => sum + row.pontos, 0);
  const totalPeso = indicators.reduce((sum, indicator) => sum + indicator.peso, 0);
  const atendimentoMes = SCORECARD_MONTHLY_POOL
    ? (totalPontos / SCORECARD_MONTHLY_POOL) * 100
    : 0;

  return {
    rows,
    totalPontos,
    totalPeso,
    pontosPossiveisMes: SCORECARD_MONTHLY_POOL,
    atendimentoMes,
  };
}

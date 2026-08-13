import {
  FIVES_SCORECARD_POINTS,
  FIVES_SCORECARD_WEIGHT,
  type FiveSResult,
} from "@/features/cinco-s/types";
import type { PeriodRange } from "@/lib/period";

export interface FiveSPublishedUnit {
  n: string;
  v: number;
}

export interface FiveSPublishedMonth {
  label: string;
  v: number;
  units: number;
}

export interface FiveSPublishedPayload {
  pontos: number;
  peso: number;
  meta: number;
  resultado: number;
  referenceYear: number;
  referenceMonth: number;
  excludedUnits: string[];
  /** Intervalo de período usado no cálculo publicado; `null` = sem restrição. */
  periodo?: PeriodRange | null;
  unidades: FiveSPublishedUnit[];
  mensal: FiveSPublishedMonth[];
}

/** Converte somente o resultado calculado com registros reais do Neon. */
export function toFiveSPublishedPayload(result: FiveSResult): FiveSPublishedPayload {
  if (result.geral === null || result.latestYear === null || result.latestMonth === null) {
    throw new Error("O último período não possui unidades elegíveis para publicação.");
  }

  return {
    pontos: FIVES_SCORECARD_POINTS,
    peso: FIVES_SCORECARD_WEIGHT,
    meta: result.threshold * 100,
    resultado: result.geral * 100,
    referenceYear: result.latestYear,
    referenceMonth: result.latestMonth,
    excludedUnits: result.excludedUnits,
    periodo: result.period,
    unidades: result.unitMonths
      .filter(
        (item) =>
          item.year === result.latestYear && item.month === result.latestMonth && !item.excluded,
      )
      .map((item) => ({ n: item.unit, v: item.aderencia * 100 }))
      .sort((a, b) => b.v - a.v),
    mensal: result.months
      .filter((month) => month.geral !== null)
      .map((month) => ({
        label: month.label,
        v: (month.geral ?? 0) * 100,
        units: month.unitsCount,
      })),
  };
}

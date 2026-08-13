import {
  ACCIDENT_RATE_SCORECARD_POINTS,
  ACCIDENT_RATE_SCORECARD_WEIGHT,
  type AccidentRateResult,
} from "@/features/taxa-acidentes/types";

export interface AccidentRatePublishedMonth {
  label: string;
  taxa: number;
  caf: number;
}

export interface AccidentRatePublishedUnit {
  year: number;
  month: number;
  label: string;
  unidade: string;
  caf: number;
  saf: number;
}

export interface AccidentRatePublishedPayload {
  pontos: number;
  peso: number;
  meta: number;
  resultado: number;
  metaFrequencia: number;
  acidentesCaf: number;
  acidentesCafPorUnidade: number;
  acidentesSaf: number;
  desempenhoMes: number;
  referenceYear: number;
  referenceMonth: number;
  mensal: AccidentRatePublishedMonth[];
  unidades: AccidentRatePublishedUnit[];
}

export function toAccidentRatePublishedPayload(
  result: AccidentRateResult,
): AccidentRatePublishedPayload {
  if (
    result.result === null ||
    result.latestRate === null ||
    result.latestYear === null ||
    result.latestMonth === null
  ) {
    throw new Error("Não há meses válidos para publicar a Taxa de Acidentes.");
  }

  return {
    pontos: ACCIDENT_RATE_SCORECARD_POINTS,
    peso: ACCIDENT_RATE_SCORECARD_WEIGHT,
    meta: result.target,
    resultado: result.result,
    metaFrequencia: result.target,
    acidentesCaf: result.totalCaf,
    acidentesCafPorUnidade: result.totalUnitCaf,
    acidentesSaf: result.totalSaf,
    desempenhoMes: result.latestRate,
    referenceYear: result.latestYear,
    referenceMonth: result.latestMonth,
    mensal: result.monthly.map((month) => ({
      label: month.label,
      taxa: month.rate,
      caf: month.caf,
    })),
    unidades: result.units
      .filter((unit) => !unit.excluded)
      .map((unit) => ({
        year: unit.year,
        month: unit.month,
        label: unit.label,
        unidade: unit.unit,
        caf: unit.caf,
        saf: unit.saf,
      })),
  };
}

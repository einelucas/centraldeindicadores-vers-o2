import type { IdpDetailedResult } from "@/features/idp/types";
import {
  IDP_SCORECARD_POINTS,
  IDP_SCORECARD_WEIGHT,
} from "@/features/idp/types";

export interface IdpPublishedUnit {
  n: string;
  v: number;
}

export interface IdpPublishedMonth {
  label: string;
  v: number | null;
  /** Disponível nas publicações novas; versões antigas podem não possuir. */
  linhaBase?: number;
  real?: number;
}

export interface IdpPublishedPayload {
  pontos: number;
  peso: number;
  meta: number;
  resultado: number;
  civil: number;
  mecanica: number;
  eia: number;
  selectedYear: number;
  monthStart: number;
  monthEnd: number;
  totalLinhaBase: number;
  totalReal: number;
  unidades: IdpPublishedUnit[];
  mensal: IdpPublishedMonth[];
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Converte somente resultados calculados a partir do banco em snapshot publicado. */
export function toIdpPublishedPayload(
  result: IdpDetailedResult,
  targetPercent: number,
): IdpPublishedPayload {
  if (result.totalLinhaBase <= 0) {
    throw new Error(
      "Não há custo de linha de base válido no período selecionado para publicar.",
    );
  }

  return {
    pontos: IDP_SCORECARD_POINTS,
    peso: IDP_SCORECARD_WEIGHT,
    meta: targetPercent,
    resultado: roundPercent(result.aderenciaGeral * 100),
    civil: roundPercent(result.groups.civil.aderencia * 100),
    mecanica: roundPercent(result.groups.mecanica.aderencia * 100),
    eia: roundPercent(result.groups.eia.aderencia * 100),
    selectedYear: result.selectedYear,
    monthStart: result.monthStart,
    monthEnd: result.monthEnd,
    totalLinhaBase: result.totalLinhaBase,
    totalReal: result.totalReal,
    unidades: result.units
      .filter((unit) => unit.custoLinhaBase > 0)
      .map((unit) => ({
        n: unit.name.replace(/^INPASA\s*/i, "").trim(),
        v: roundPercent(unit.aderencia * 100),
      }))
      .sort((a, b) => b.v - a.v),
    mensal: result.monthly.map((month) => ({
      label: month.label,
      v:
        month.custoLinhaBase > 0
          ? roundPercent(month.aderencia * 100)
          : null,
      linhaBase: month.custoLinhaBase,
      real: month.custoReal,
    })),
  };
}

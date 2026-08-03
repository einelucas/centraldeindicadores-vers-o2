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
  v: number;
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

/** Converte somente resultados calculados a partir do banco em snapshot publicado. */
export function toIdpPublishedPayload(
  result: IdpDetailedResult,
  targetPercent: number,
): IdpPublishedPayload {
  return {
    pontos: IDP_SCORECARD_POINTS,
    peso: IDP_SCORECARD_WEIGHT,
    meta: targetPercent,
    resultado: result.aderenciaGeral * 100,
    civil: result.groups.civil.aderencia * 100,
    mecanica: result.groups.mecanica.aderencia * 100,
    eia: result.groups.eia.aderencia * 100,
    selectedYear: result.selectedYear,
    monthStart: result.monthStart,
    monthEnd: result.monthEnd,
    totalLinhaBase: result.totalLinhaBase,
    totalReal: result.totalReal,
    unidades: result.units
      .map((unit) => ({
        n: unit.name.replace(/^INPASA\s*/i, "").trim(),
        v: Math.round(unit.aderencia * 100),
      }))
      .sort((a, b) => b.v - a.v),
    mensal: result.monthly.map((month) => ({
      label: month.label,
      v: Math.round(month.aderencia * 100),
    })),
  };
}

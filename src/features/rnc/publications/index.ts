import type { RncResult } from "@/features/rnc/types";
import { RNC_SCORECARD_POINTS, RNC_SCORECARD_WEIGHT } from "@/features/rnc/types";
import type { PeriodRange } from "@/lib/period";

export interface RncPublishedUnit {
  n: string;
  v: number;
}

export interface RncPublishedMonth {
  label: string;
  v: number | null;
}

export interface RncPublishedOffender {
  n: string;
  pct: number;
}

export interface RncPublishedPayload {
  pontos: number;
  peso: number;
  meta: number;
  resultado: number;
  semestreResolvidas: number;
  semestreTotal: number;
  /** Intervalo de período usado no cálculo publicado; `null` = sem restrição. */
  periodo?: PeriodRange | null;
  unidades: RncPublishedUnit[];
  mensal: RncPublishedMonth[];
  ofensores: RncPublishedOffender[];
}

/**
 * Gera um snapshot somente a partir do resultado calculado com registros do Neon.
 * Nenhum mês, unidade ou ofensor é criado artificialmente.
 */
export function toRncPublishedPayload(result: RncResult): RncPublishedPayload {
  if (result.resultadoDias === null) {
    throw new Error("Não há RNC solucionada com tempo de tratativa para publicar.");
  }

  const top = result.ofensores.slice(0, 4);
  const outrosPct = 1 - top.reduce((sum, offender) => sum + offender.pct, 0);

  return {
    pontos: RNC_SCORECARD_POINTS,
    peso: RNC_SCORECARD_WEIGHT,
    meta: result.metaDias,
    resultado: result.resultadoDias,
    semestreResolvidas: result.totalTratadas,
    semestreTotal: result.totalCriadas,
    periodo: result.period,
    unidades: result.units
      .filter((unit) => !unit.excluded)
      .map((unit) => ({
        n: unit.name.replace(/^INPASA\s*/i, "").trim(),
        v: Math.round(unit.aderencia * 100),
      }))
      .sort((a, b) => b.v - a.v),
    mensal: result.months.map((month) => ({
      label: month.label,
      v: month.diasMedios === null ? null : Math.round(month.diasMedios * 100) / 100,
    })),
    ofensores: [
      ...top.map((offender) => ({
        n: offender.name,
        pct: Math.round(offender.pct * 1000) / 10,
      })),
      ...(outrosPct > 0.001 ? [{ n: "Outros", pct: Math.round(outrosPct * 1000) / 10 }] : []),
    ],
  };
}

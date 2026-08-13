import { RDO_SCORECARD_POINTS, RDO_SCORECARD_WEIGHT, type RdoResult } from "@/features/rdo/types";
import type { PeriodRange } from "@/lib/period";

export interface RdoPublishedUnit {
  n: string;
  v: number;
}

export interface RdoPublishedMonth {
  label: string;
  v: number | null;
}

export interface RdoPublishedPayload {
  pontos: number;
  peso: number;
  meta: number;
  resultado: number;
  aprovados: number;
  emitidos: number;
  emRevisaoPct: number;
  preenchendoPct: number;
  /** Intervalo de período usado no cálculo publicado; `null` = sem restrição. */
  periodo?: PeriodRange | null;
  unidades: RdoPublishedUnit[];
  mensal: RdoPublishedMonth[];
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Converte o cálculo administrativo no snapshot usado pelo painel publicado.
 * O formato segue exatamente o objeto criado por rdoPublishBtn no HTML de referência.
 */
export function toRdoPublishedPayload(
  result: RdoResult,
  targetPercent: number,
): RdoPublishedPayload {
  if (result.totalEmitidos <= 0) {
    throw new Error("Não há RDO emitido no período para calcular a aprovação.");
  }

  const resultado = (result.totalAprovados / result.totalEmitidos) * 100;

  return {
    pontos: RDO_SCORECARD_POINTS,
    peso: RDO_SCORECARD_WEIGHT,
    meta: targetPercent,
    resultado: roundPercent(resultado),
    aprovados: result.totalAprovados,
    emitidos: result.totalEmitidos,
    emRevisaoPct: roundPercent((result.totalRevisar / result.totalEmitidos) * 100),
    preenchendoPct: roundPercent((result.totalPreenchendo / result.totalEmitidos) * 100),
    periodo: result.period,
    unidades: result.units
      .filter((unit) => unit.emitidos > 0 && !unit.excluded)
      .map((unit) => ({
        n: unit.name.replace(/^INPASA\s*/i, "").trim(),
        v: Math.round(unit.aderencia * 100),
      }))
      .sort((a, b) => b.v - a.v),
    mensal: result.months.map((month) => ({
      label: month.label,
      v: month.emitidos > 0 ? roundPercent((month.aprovados / month.emitidos) * 100) : null,
    })),
  };
}

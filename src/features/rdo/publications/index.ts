import {
  RDO_SCORECARD_POINTS,
  RDO_SCORECARD_WEIGHT,
  type RdoResult,
} from "@/features/rdo/types";

export interface RdoPublishedUnit {
  n: string;
  v: number;
}

export interface RdoPublishedMonth {
  label: string;
  v: number;
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
  unidades: RdoPublishedUnit[];
  mensal: RdoPublishedMonth[];
}

/**
 * Converte o cálculo administrativo no snapshot usado pelo painel publicado.
 * O formato segue exatamente o objeto criado por rdoPublishBtn no HTML de referência.
 */
export function toRdoPublishedPayload(
  result: RdoResult,
  targetPercent: number,
): RdoPublishedPayload {
  const resultado = result.totalEmitidos
    ? (result.totalAprovados / result.totalEmitidos) * 100
    : 0;

  return {
    pontos: RDO_SCORECARD_POINTS,
    peso: RDO_SCORECARD_WEIGHT,
    meta: targetPercent,
    resultado,
    aprovados: result.totalAprovados,
    emitidos: result.totalEmitidos,
    emRevisaoPct: result.totalEmitidos
      ? (result.totalRevisar / result.totalEmitidos) * 100
      : 0,
    preenchendoPct: result.totalEmitidos
      ? (result.totalPreenchendo / result.totalEmitidos) * 100
      : 0,
    unidades: result.units
      .map((unit) => ({
        n: unit.name.replace(/^INPASA\s*/i, "").trim(),
        v: Math.round(unit.aderencia * 100),
      }))
      .sort((a, b) => b.v - a.v),
    mensal: result.months.map((month) => ({
      label: month.label,
      v: month.emitidos
        ? Math.round((month.aprovados / month.emitidos) * 100)
        : 0,
    })),
  };
}

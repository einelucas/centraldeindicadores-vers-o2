import type { IdpDetailedResult } from "@/features/idp/types";
import { IDP_SCORECARD_POINTS, IDP_SCORECARD_WEIGHT } from "@/features/idp/types";
import { normalizePeriodRange, type PeriodRange } from "@/lib/period";

export interface IdpPublishedUnit {
  n: string;
  v: number;
  rsoNumero?: number;
  referenceYear?: number;
  referenceMonth?: number;
  referenceSource?: string;
  referenceOriginalText?: string | null;
  referenceAdjusted?: boolean;
  periodStart?: string | null;
  periodEnd?: string | null;
  emissionDate?: string | null;
  fileName?: string;
}

export interface IdpPublishedDiscipline {
  n: string;
  v: number | null;
}

export interface IdpPublishedMonth {
  label: string;
  v: number | null;
  linhaBase?: number;
  real?: number;
  documentosAtivos?: number;
}

export interface IdpPublishedPayload {
  pontos: number;
  peso: number;
  meta: number;
  resultado: number;
  civil: number | null;
  mecanica: number | null;
  eletrica: number | null;
  /** Compatibilidade com publicações antigas. */
  eia?: number | null;
  selectedYear: number;
  selectedMonth: number;
  historyStartYear?: number;
  historyMonthStart: number;
  historyEndYear?: number;
  historyMonthEnd: number;
  /** Mesmo formato usado por RDO/RNC/5S/Taxa de Acidentes — aditivo, não substitui os campos acima. */
  periodo?: PeriodRange | null;
  /** Mantidos para compatibilidade com o Scorecard e snapshots antigos. */
  monthStart: number;
  monthEnd: number;
  totalLinhaBase: number;
  totalReal: number;
  documentosAtivos: number;
  unidades: IdpPublishedUnit[];
  disciplinas: IdpPublishedDiscipline[];
  mensal: IdpPublishedMonth[];
}

function roundPercent(value: number): number {
  return Math.round(value * 10_000) / 100;
}

function disciplineValue(result: IdpDetailedResult, name: string): number | null {
  const row = result.disciplineRows.find((item) => item.discipline === name);
  return row?.aderencia === null || row?.aderencia === undefined
    ? null
    : roundPercent(row.aderencia);
}

/** Snapshot imutável com os RSOs exatos que participaram da publicação. */
export function toIdpPublishedPayload(
  result: IdpDetailedResult,
  targetPercent: number,
): IdpPublishedPayload {
  if (!result.activeDocuments || result.totalPrevistoMedio <= 0) {
    throw new Error(
      "Não há RSO com execução prevista válida na competência selecionada para publicar.",
    );
  }

  return {
    pontos: IDP_SCORECARD_POINTS,
    peso: IDP_SCORECARD_WEIGHT,
    meta: targetPercent,
    resultado: roundPercent(result.aderenciaGeral),
    civil: disciplineValue(result, "01 - Civil"),
    mecanica: disciplineValue(result, "02 - Mecânica"),
    eletrica: disciplineValue(result, "04 - Elétrica"),
    selectedYear: result.selectedYear,
    selectedMonth: result.selectedMonth,
    historyStartYear: result.historyStartYear,
    historyMonthStart: result.historyMonthStart,
    historyEndYear: result.historyEndYear,
    historyMonthEnd: result.historyMonthEnd,
    periodo: normalizePeriodRange({
      startYear: result.historyStartYear ?? result.selectedYear,
      startMonth: result.historyMonthStart,
      endYear: result.historyEndYear ?? result.selectedYear,
      endMonth: result.historyMonthEnd,
    }),
    monthStart: result.historyMonthStart,
    monthEnd: result.historyMonthEnd,
    totalLinhaBase: result.totalPrevistoMedio,
    totalReal: result.totalRealMedio,
    documentosAtivos: result.activeDocuments,
    unidades: result.unitRows
      .filter((unit) => !unit.excluded)
      .map((unit) => ({
        n: unit.unit.replace(/^INPASA\s*/i, "").trim(),
        v: roundPercent(unit.aderencia),
        rsoNumero: unit.rsoNumero,
        referenceYear: unit.referenceYear,
        referenceMonth: unit.referenceMonth,
        referenceSource: unit.referenceSource,
        referenceOriginalText: unit.referenceOriginalText,
        referenceAdjusted: unit.referenceAdjusted,
        periodStart: unit.periodStart,
        periodEnd: unit.periodEnd,
        emissionDate: unit.emissionDate,
        fileName: unit.fileName,
      })),
    disciplinas: result.disciplineRows.map((row) => ({
      n: row.discipline,
      v: row.aderencia === null ? null : roundPercent(row.aderencia),
    })),
    mensal: result.monthly.map((month) => ({
      label: month.label,
      v: month.aderencia === null ? null : roundPercent(month.aderencia),
      linhaBase: month.totalPrevistoMedio,
      real: month.totalRealMedio,
      documentosAtivos: month.activeDocuments,
    })),
  };
}

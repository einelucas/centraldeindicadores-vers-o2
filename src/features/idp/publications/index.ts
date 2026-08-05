import type { IdpDetailedResult } from "@/features/idp/types";
import { IDP_SCORECARD_POINTS, IDP_SCORECARD_WEIGHT } from "@/features/idp/types";

export interface IdpPublishedUnit {
  n: string;
  v: number;
  /** Ausente em snapshots anteriores à migração para RSO. */
  rsoNumero?: number | null;
  referenceDate?: string;
}

export interface IdpPublishedDiscipline {
  n: string;
  v: number;
}

export interface IdpPublishedMonth {
  label: string;
  v: number | null;
  linhaBase?: number;
  real?: number;
  activeDocuments?: number;
}

export interface IdpPublishedPayload {
  pontos: number;
  peso: number;
  meta: number;
  resultado: number;
  civil: number | null;
  mecanica: number | null;
  /** Campos RSO podem não existir em snapshots antigos do IDP. */
  eletrica?: number | null;
  /** Alias de compatibilidade com snapshots antigos. */
  eia: number | null;
  documentosAtivos?: number;
  totalPrevistoMedio?: number;
  totalRealMedio?: number;
  /** Campos legados mantidos para o scorecard já existente. */
  totalLinhaBase: number;
  totalReal: number;
  selectedYear: number;
  monthStart: number;
  monthEnd: number;
  unidades: IdpPublishedUnit[];
  disciplinas?: IdpPublishedDiscipline[];
  mensal: IdpPublishedMonth[];
}

function roundPercent(value: number): number {
  return Math.round(value * 10_000) / 100;
}

function disciplinePercent(result: IdpDetailedResult, name: string): number | null {
  const row = result.disciplineRows.find((item) => item.discipline === name);
  return row?.aderencia === null || row?.aderencia === undefined
    ? null
    : roundPercent(row.aderencia);
}

/** Converte o cálculo RSO em snapshot imutável do painel. */
export function toIdpPublishedPayload(
  result: IdpDetailedResult,
  targetPercent: number,
): IdpPublishedPayload {
  if (!result.activeDocuments) {
    throw new Error("Não há documentos RSO ativos para publicar.");
  }

  const resultado = roundPercent(result.aderenciaGeral);
  const eletrica = disciplinePercent(result, "04 - Elétrica");

  return {
    pontos: IDP_SCORECARD_POINTS,
    peso: IDP_SCORECARD_WEIGHT,
    meta: targetPercent,
    resultado,
    civil: disciplinePercent(result, "01 - Civil"),
    mecanica: disciplinePercent(result, "02 - Mecânica"),
    eletrica,
    eia: eletrica,
    documentosAtivos: result.activeDocuments,
    totalPrevistoMedio: result.totalPrevistoMedio,
    totalRealMedio: result.totalRealMedio,
    totalLinhaBase: result.totalPrevistoMedio,
    totalReal: result.totalRealMedio,
    selectedYear: result.selectedYear,
    monthStart: result.monthStart,
    monthEnd: result.monthEnd,
    unidades: result.unitRows
      .map((unit) => ({
        n: unit.unit.replace(/^INPASA\s*/i, "").trim(),
        v: roundPercent(unit.aderencia),
        rsoNumero: unit.rsoNumero,
        referenceDate: unit.referenceDate,
      }))
      .sort((a, b) => b.v - a.v),
    disciplinas: result.disciplineRows
      .filter((row) => row.aderencia !== null)
      .map((row) => ({ n: row.discipline, v: roundPercent(row.aderencia ?? 0) })),
    mensal: result.monthly.map((month) => ({
      label: month.label,
      v: month.aderencia === null ? null : roundPercent(month.aderencia),
      linhaBase: month.totalPrevistoMedio,
      real: month.totalRealMedio,
      activeDocuments: month.activeDocuments,
    })),
  };
}

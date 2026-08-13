/** Tipos do módulo 5S. */

import type { PeriodRange } from "@/lib/period";

/** Área auditada dentro de uma unidade. */
export interface FiveSArea {
  divisao: string | null;
  area: string;
  meta: number;
  nota: number;
}

/** Registro 5S normalizado: uma unidade num mês, com suas áreas. */
export interface FiveSNormalizedRecord {
  unit: string;
  year: number;
  month: number; // 1..12
  areas: FiveSArea[];
  raw: Record<string, unknown>;
}

/** Aderência de uma unidade num mês. */
export interface FiveSUnitMonth {
  unit: string;
  year: number;
  month: number;
  aderencia: number; // média das aderências de área (0-1)
  excluded: boolean;
  areas: FiveSArea[];
}

/** Consolidado real de um mês. */
export interface FiveSMonthResult {
  year: number;
  month: number;
  label: string;
  geral: number | null;
  unitsCount: number;
}

/** Resultado consolidado do 5S. */
export interface FiveSResult {
  threshold: number;
  excludedUnits: string[];
  period: PeriodRange | null;
  periodLabel: string;
  latestYear: number | null;
  latestMonth: number | null;
  geral: number | null;
  passaMeta: boolean;
  unitMonths: FiveSUnitMonth[];
  months: FiveSMonthResult[];
  unitsCount: number;
  monthsCount: number;
}

/** Meta oficial do 5S: 90%. */
export const FIVES_DEFAULT_TARGET = 0.9;

/** Unidades excluídas por padrão (regra do HTML de referência). */
export const FIVES_DEFAULT_EXCLUDED = ["SP", "CSC"] as const;

/** Participação do 5S no ciclo de 11.582 pontos. */
export const FIVES_SCORECARD_POINTS = 1_158.2;
export const FIVES_SCORECARD_WEIGHT = 0.1;

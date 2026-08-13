/** Tipos e constantes do módulo Taxa de Acidentes. */

import type { PeriodRange } from "@/lib/period";

export const ACCIDENT_RATE_DEFAULT_TARGET = 7.5;
export const ACCIDENT_RATE_SCORECARD_WEIGHT = 0.2;
export const ACCIDENT_RATE_SCORECARD_POINTS = 2_316.4;

export interface AccidentMonthlyInput {
  year: number;
  month: number;
  rate: number;
  caf: number;
}

export interface AccidentMonthlyRecord extends AccidentMonthlyInput {
  id: string;
}

export interface AccidentUnitInput {
  year: number;
  month: number;
  unit: string;
  saf: number;
  caf: number;
}

export interface AccidentUnitRecord extends AccidentUnitInput {
  id: string;
  unitKey: string;
}

export interface AccidentMonthlyResult extends AccidentMonthlyInput {
  label: string;
  ok: boolean;
}

export interface AccidentUnitResult extends AccidentUnitRecord {
  label: string;
  excluded: boolean;
}

export interface AccidentRateResult {
  target: number;
  excludedUnits: string[];
  period: PeriodRange | null;
  result: number | null;
  totalCaf: number;
  totalUnitCaf: number;
  totalSaf: number;
  latestRate: number | null;
  latestYear: number | null;
  latestMonth: number | null;
  monthsCount: number;
  monthly: AccidentMonthlyResult[];
  units: AccidentUnitResult[];
}

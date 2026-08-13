/** Cálculos puros da Taxa de Acidentes. */

import { MONTH_NAMES_FULL } from "@/lib/dates";
import {
  compareAccidentUnits,
  normalizeAccidentUnitCode,
} from "@/features/taxa-acidentes/utils/units";
import {
  type AccidentMonthlyInput,
  type AccidentRateResult,
  type AccidentUnitRecord,
} from "@/features/taxa-acidentes/types";
import { isWithinPeriodRange, type PeriodRange } from "@/lib/period";

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES_FULL[month - 1] ?? month}/${year}`;
}

/**
 * Regras do indicador:
 * - o mesmo ano/mês é substituído pela última ocorrência;
 * - resultado do período = média aritmética de todos os meses carregados;
 * - acidentes CAF mensais = soma do período;
 * - desempenho do mês = taxa do período cronologicamente mais recente;
 * - quanto menor a taxa, melhor; atende quando resultado <= meta;
 * - os registros por unidade guardam as quantidades de acidentes CAF e SAF
 *   separadas por competência.
 */
export function computeAccidentRateResult(
  monthlyRecords: readonly AccidentMonthlyInput[],
  unitRecords: readonly AccidentUnitRecord[],
  target: number,
  excludedUnits: readonly string[] = [],
  period: PeriodRange | null = null,
): AccidentRateResult {
  const excludedNormalized = Array.from(
    new Set(excludedUnits.map(normalizeAccidentUnitCode).filter(Boolean)),
  );
  const excludeSet = new Set(excludedNormalized);

  const monthByKey = new Map<string, AccidentMonthlyInput>();
  for (const record of monthlyRecords) {
    if (!isWithinPeriodRange(record.year, record.month, period)) continue;
    monthByKey.set(`${record.year}-${String(record.month).padStart(2, "0")}`, record);
  }

  const monthly = Array.from(monthByKey.values())
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((record) => ({
      ...record,
      label: monthLabel(record.year, record.month),
      ok: record.rate <= target,
    }));

  const latest = monthly.at(-1) ?? null;
  const result = monthly.length
    ? monthly.reduce((sum, record) => sum + record.rate, 0) / monthly.length
    : null;

  const totalCaf = monthly.reduce((sum, record) => sum + record.caf, 0);

  const units = unitRecords
    .filter((record) => isWithinPeriodRange(record.year, record.month, period))
    .map((record) => ({
      ...record,
      unit: normalizeAccidentUnitCode(record.unit),
    }))
    .sort((a, b) => a.year - b.year || a.month - b.month || compareAccidentUnits(a.unit, b.unit))
    .map((record) => ({
      ...record,
      label: monthLabel(record.year, record.month),
      excluded: excludeSet.has(record.unit),
    }));
  const includedUnits = units.filter((unit) => !unit.excluded);

  return {
    target,
    excludedUnits: excludedNormalized,
    period,
    result,
    totalCaf,
    totalUnitCaf: includedUnits.reduce((sum, record) => sum + record.caf, 0),
    totalSaf: includedUnits.reduce((sum, record) => sum + record.saf, 0),
    latestRate: latest?.rate ?? null,
    latestYear: latest?.year ?? null,
    latestMonth: latest?.month ?? null,
    monthsCount: monthly.length,
    monthly,
    units,
  };
}

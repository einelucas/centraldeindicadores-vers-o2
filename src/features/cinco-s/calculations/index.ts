/**
 * Cálculos do 5S. Funções puras, migradas de combineAndRenderFs() e
 * aderenciaArea() do HTML de referência.
 *
 * Regras preservadas:
 *  - Aderência de área = min(nota/meta, 1).
 *  - Aderência da unidade/mês = média simples das aderências de área.
 *  - GERAL do mês = média simples das unidades NÃO excluídas com dados no mês.
 *  - Resultado atual = GERAL do último mês realmente existente na base.
 */

import { MONTH_NAMES } from "@/lib/dates";
import { isWithinPeriodRange, type PeriodRange } from "@/lib/period";
import { compareFiveSUnits, normalizeFiveSUnitCode } from "@/features/cinco-s/utils/units";
import {
  FIVES_DEFAULT_TARGET,
  type FiveSArea,
  type FiveSMonthResult,
  type FiveSNormalizedRecord,
  type FiveSResult,
  type FiveSUnitMonth,
} from "@/features/cinco-s/types";

/** Aderência de uma área: min(nota/meta, 1). */
export function aderenciaArea(area: FiveSArea): number {
  if (!Number.isFinite(area.meta) || area.meta <= 0) return 0;
  if (!Number.isFinite(area.nota)) return 0;
  return Math.min(Math.max(area.nota / area.meta, 0), 1);
}

/** Aderência média de uma unidade a partir de suas áreas reais. */
export function aderenciaUnidade(areas: readonly FiveSArea[]): number {
  if (!areas.length) return 0;
  return areas.reduce((sum, area) => sum + aderenciaArea(area), 0) / areas.length;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? month}/${year}`;
}

export function computeFiveSResult(
  records: readonly FiveSNormalizedRecord[],
  excluded: readonly string[] = [],
  threshold: number = FIVES_DEFAULT_TARGET,
  period: PeriodRange | null = null,
): FiveSResult {
  const excludedUnits = Array.from(new Set(excluded.map(normalizeFiveSUnitCode).filter(Boolean)));
  const excludeSet = new Set(excludedUnits);

  // A identidade lógica do módulo é unidade + ano + mês. Em caso de registros
  // repetidos no array, a última ocorrência representa a versão mais recente.
  const unique = new Map<string, { record: FiveSNormalizedRecord; usesOfficialCode: boolean }>();
  for (const record of records) {
    const unit = normalizeFiveSUnitCode(record.unit);
    if (!unit || !record.areas.length) continue;
    if (!Number.isInteger(record.year) || !Number.isInteger(record.month)) continue;
    if (record.month < 1 || record.month > 12) continue;
    // Corte estrutural: fora do período selecionado, o registro nem entra
    // em nenhuma tabela. Sem período definido, nada é restringido.
    if (period && !isWithinPeriodRange(record.year, record.month, period)) continue;

    const key = `${unit}|||${monthKey(record.year, record.month)}`;
    const usesOfficialCode = record.unit.trim().toUpperCase() === unit;
    const previous = unique.get(key);

    // Bases antigas podem conter o nome completo e a sigla para o mesmo mês.
    // A versão já gravada com a sigla oficial tem prioridade; entre registros
    // equivalentes, a última ocorrência continua representando a correção mais recente.
    if (!previous || usesOfficialCode || !previous.usesOfficialCode) {
      unique.set(key, {
        record: { ...record, unit },
        usesOfficialCode,
      });
    }
  }

  const unitMonths: FiveSUnitMonth[] = Array.from(unique.values())
    .map(({ record }) => ({
      unit: record.unit,
      year: record.year,
      month: record.month,
      aderencia: aderenciaUnidade(record.areas),
      excluded: excludeSet.has(record.unit),
      areas: record.areas,
    }))
    .sort((a, b) => a.year - b.year || a.month - b.month || compareFiveSUnits(a.unit, b.unit));

  const monthKeys = Array.from(
    new Set(unitMonths.map((item) => monthKey(item.year, item.month))),
  ).sort();

  const months: FiveSMonthResult[] = monthKeys.map((key) => {
    const [yearText, monthText] = key.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const values = unitMonths
      .filter((item) => item.year === year && item.month === month && !item.excluded)
      .map((item) => item.aderencia);

    return {
      year,
      month,
      label: monthLabel(year, month),
      geral: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      unitsCount: values.length,
    };
  });

  const latest = months[months.length - 1] ?? null;
  const geral = latest?.geral ?? null;

  return {
    threshold,
    excludedUnits,
    period,
    periodLabel: latest?.label ?? "—",
    latestYear: latest?.year ?? null,
    latestMonth: latest?.month ?? null,
    geral,
    passaMeta: geral !== null && geral >= threshold,
    unitMonths,
    months,
    unitsCount: new Set(unitMonths.map((item) => item.unit)).size,
    monthsCount: months.length,
  };
}

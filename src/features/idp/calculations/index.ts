/**
 * Cálculos do IDP baseados nos PDFs RSO.
 *
 * Regras centrais:
 *  - cada RSO é uma versão semanal independente e permanece no histórico;
 *  - a competência é mês/ano explícito do documento (ou ajuste manual rastreado);
 *  - para uma competência, entra no cálculo apenas o maior RSO de cada unidade;
 *  - documentos de outros meses nunca são carregados para preencher lacunas;
 *  - execução geral = média das linhas "Execução" das fases do RSO ativo;
 *  - aderência da unidade = realizado acumulado / previsto acumulado;
 *  - aderência geral = média simples das aderências das unidades ativas.
 */

import { isIdpDisciplineExcluded } from "@/features/idp/configuration";
import {
  IDP_DEFAULT_MONTH_END,
  IDP_DEFAULT_MONTH_START,
  IDP_DEFAULT_TARGET,
  IDP_DISC_NAMES,
  type IdpDetailedResult,
  type IdpDisciplineAggregate,
  type IdpDisciplineUnitGroup,
  type IdpMonthlyAggregate,
  type IdpNormalizedRecord,
  type IdpRsoAreaValue,
  type IdpUnitDetail,
  type IdpUnitExecutionRow,
} from "@/features/idp/types";
import { MONTH_NAMES_FULL } from "@/lib/dates";
import {
  enumeratePeriodMonths,
  isWithinPeriodRange,
  normalizePeriodRange,
  type PeriodRange,
} from "@/lib/period";
import { normalizeIdpUnitCode } from "@/features/idp/utils/units";

export interface IdpPeriodOptions {
  /** Intervalo travado (Ano + Semestre) — a competência efetiva é a mais
      recente com RSO dentro dele. `selectedYear`/`selectedMonth` continuam
      aceitos para forçar uma competência específica quando necessário. */
  periodRange?: PeriodRange;
  selectedYear?: number;
  selectedMonth?: number;
  historyStartYear?: number;
  historyMonthStart?: number;
  historyEndYear?: number;
  historyMonthEnd?: number;
}

export function calculateIdpAdherence(real: number, previsto: number): number {
  if (!Number.isFinite(previsto) || previsto === 0) return 0;
  return (Number(real) || 0) / previsto;
}

/** Extrai o código numérico prefixado no nome da disciplina. */
export function disciplineSortKey(name: string): number {
  const match = String(name ?? "").match(/^(\d+)/);
  return match ? Number.parseInt(match[1]!, 10) : 999;
}

export function normalizedUnitKey(value: string): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("pt-BR");
}

function tieBreakerTime(entry: IdpNormalizedRecord): number {
  const candidates = [entry.updatedAt, entry.emissionDate, entry.periodEnd];
  for (const value of candidates) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

/**
 * Seleciona um único RSO por unidade dentre os registros recebidos. Como a
 * função normalmente recebe apenas uma competência, o maior número do RSO é
 * a versão ativa. Reimportações do mesmo RSO usam updatedAt apenas como desempate.
 */
export function selectLatestRsoByUnit(
  entries: readonly IdpNormalizedRecord[],
): IdpNormalizedRecord[] {
  const latestByUnit = new Map<string, IdpNormalizedRecord>();

  for (const entry of entries) {
    const unitKey = normalizeIdpUnitCode(entry.unit);
    if (!unitKey) continue;

    const current = latestByUnit.get(unitKey);
    if (!current) {
      latestByUnit.set(unitKey, entry);
      continue;
    }

    const currentNumber = current.rsoNumero ?? Number.NEGATIVE_INFINITY;
    const nextNumber = entry.rsoNumero ?? Number.NEGATIVE_INFINITY;
    if (
      nextNumber > currentNumber ||
      (nextNumber === currentNumber && tieBreakerTime(entry) > tieBreakerTime(current))
    ) {
      latestByUnit.set(unitKey, entry);
    }
  }

  return Array.from(latestByUnit.values()).sort((a, b) => a.unit.localeCompare(b.unit, "pt-BR"));
}

function average(values: readonly number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isCompleteReference(entry: IdpNormalizedRecord): entry is IdpNormalizedRecord & {
  referenceYear: number;
  referenceMonth: number;
  rsoNumero: number;
} {
  return (
    Number.isInteger(entry.referenceYear) &&
    Number.isInteger(entry.referenceMonth) &&
    (entry.referenceMonth ?? 0) >= 1 &&
    (entry.referenceMonth ?? 0) <= 12 &&
    Number.isInteger(entry.rsoNumero) &&
    (entry.rsoNumero ?? 0) > 0
  );
}

export function recordsInCompetence(
  entries: readonly IdpNormalizedRecord[],
  year: number,
  month: number,
): IdpNormalizedRecord[] {
  return entries.filter(
    (entry) =>
      isCompleteReference(entry) && entry.referenceYear === year && entry.referenceMonth === month,
  );
}

function buildDisciplineRows(
  activeEntries: readonly IdpNormalizedRecord[],
  excludedDisciplines: readonly string[],
): IdpDisciplineAggregate[] {
  const disciplineNames = IDP_DISC_NAMES.filter(
    (name) => !isIdpDisciplineExcluded(name, excludedDisciplines),
  );

  return disciplineNames.map((discipline) => {
    const entries: Array<IdpRsoAreaValue & { unit: string }> = [];

    for (const entry of activeEntries) {
      for (const area of entry.discData?.[discipline] ?? []) {
        entries.push({ ...area, unit: entry.unit });
      }
    }

    if (!entries.length) {
      return {
        discipline,
        entries: [],
        prevAvg: null,
        realAvg: null,
        aderencia: null,
        unitGroups: [],
      };
    }

    const prevAvg = average(entries.map((item) => item.prevAcum));
    const realAvg = average(entries.map((item) => item.realAcum));
    const grouped = new Map<string, IdpRsoAreaValue[]>();

    for (const item of entries) {
      const values = grouped.get(item.unit) ?? [];
      values.push({ area: item.area, prevAcum: item.prevAcum, realAcum: item.realAcum });
      grouped.set(item.unit, values);
    }

    const unitGroups: IdpDisciplineUnitGroup[] = Array.from(grouped.entries())
      .map(([unit, unitEntries]) => {
        const unitPrevAvg = average(unitEntries.map((item) => item.prevAcum));
        const unitRealAvg = average(unitEntries.map((item) => item.realAcum));
        return {
          unit,
          entries: unitEntries,
          prevAvg: unitPrevAvg,
          realAvg: unitRealAvg,
          aderencia: calculateIdpAdherence(unitRealAvg, unitPrevAvg),
        };
      })
      .sort((a, b) => a.unit.localeCompare(b.unit, "pt-BR"));

    return {
      discipline,
      entries,
      prevAvg,
      realAvg,
      aderencia: calculateIdpAdherence(realAvg, prevAvg),
      unitGroups,
    };
  });
}

function buildUnitDetails(
  activeEntries: readonly IdpNormalizedRecord[],
  excludedDisciplines: readonly string[],
): IdpUnitDetail[] {
  return activeEntries.map((entry) => ({
    unit: entry.unit,
    disciplines: IDP_DISC_NAMES.filter(
      (discipline) => !isIdpDisciplineExcluded(discipline, excludedDisciplines),
    )
      .map((discipline) => {
        const areas = entry.discData?.[discipline] ?? [];
        if (!areas.length) return null;
        const prevAvg = average(areas.map((item) => item.prevAcum));
        const realAvg = average(areas.map((item) => item.realAcum));
        return {
          discipline,
          n: areas.length,
          prevAvg,
          realAvg,
          aderencia: calculateIdpAdherence(realAvg, prevAvg),
          areas,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
  }));
}

function buildUnitRows(
  activeEntries: readonly IdpNormalizedRecord[],
  excludeSet: ReadonlySet<string>,
): IdpUnitExecutionRow[] {
  return activeEntries.filter(isCompleteReference).map((entry) => {
    const fases = entry.execucaoFases ?? [];
    const prevAcum = average(fases.map((phase) => Number(phase.prevAcum) || 0));
    const realAcum = average(fases.map((phase) => Number(phase.realAcum) || 0));

    return {
      sourceId: entry.id,
      unit: entry.unit,
      excluded: excludeSet.has(normalizeIdpUnitCode(entry.unit)),
      rsoNumero: entry.rsoNumero,
      referenceYear: entry.referenceYear,
      referenceMonth: entry.referenceMonth,
      referenceSource: entry.referenceSource,
      referenceOriginalText: entry.referenceOriginalText,
      referenceAdjusted: entry.referenceAdjusted,
      periodStart: entry.periodStart,
      periodEnd: entry.periodEnd,
      emissionDate: entry.emissionDate,
      fileName: entry.fileName,
      prevAcum,
      realAcum,
      aderencia: calculateIdpAdherence(realAcum, prevAcum),
      nFases: fases.length,
      fases,
    };
  });
}

function monthlyResult(
  entries: readonly IdpNormalizedRecord[],
  range: PeriodRange,
  excludeSet: ReadonlySet<string>,
): IdpMonthlyAggregate[] {
  return enumeratePeriodMonths(range).map(({ year, month }) => {
    const activeEntries = selectLatestRsoByUnit(recordsInCompetence(entries, year, month));
    const unitRows = buildUnitRows(activeEntries, excludeSet).filter((unit) => !unit.excluded);
    return {
      year,
      month,
      label: `${MONTH_NAMES_FULL[month - 1] ?? month}/${year}`,
      aderencia: unitRows.length ? average(unitRows.map((unit) => unit.aderencia)) : null,
      activeDocuments: unitRows.length,
      totalPrevistoMedio: unitRows.reduce((sum, unit) => sum + unit.prevAcum, 0),
      totalRealMedio: unitRows.reduce((sum, unit) => sum + unit.realAcum, 0),
    };
  });
}

function boundedMonth(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(12, Math.trunc(value ?? fallback)));
}

function latestCompetence(
  entries: readonly IdpNormalizedRecord[],
  range?: PeriodRange,
): { year: number; month: number } | null {
  const valid = entries
    .filter(isCompleteReference)
    .filter((entry) => !range || isWithinPeriodRange(entry.referenceYear, entry.referenceMonth, range))
    .map((entry) => ({ year: entry.referenceYear, month: entry.referenceMonth }))
    .sort((a, b) => b.year - a.year || b.month - a.month);
  return valid[0] ?? null;
}

export function computeIdpResult(
  entries: readonly IdpNormalizedRecord[],
  threshold: number = IDP_DEFAULT_TARGET,
  excludedDisciplines: readonly string[] = [],
  options: IdpPeriodOptions = {},
  excludedUnits: readonly string[] = [],
): IdpDetailedResult {
  const excludeSet = new Set(excludedUnits.map(normalizeIdpUnitCode).filter(Boolean));
  const excludedNormalized = Array.from(excludeSet);

  const latest = latestCompetence(entries);
  /** Se o intervalo travado (Ano + Semestre) foi informado, a competência
      efetiva é a mais recente com RSO dentro dele — não a mais recente do
      dataset inteiro. Sem RSO nesse intervalo, cai no fim do intervalo
      (resultado zerado, igual a um período sem publicação nos outros
      módulos), nunca num mês de outro semestre. */
  const latestInRange = options.periodRange ? latestCompetence(entries, options.periodRange) : null;

  const selectedYear =
    Number.isInteger(options.selectedYear) && (options.selectedYear ?? 0) >= 2000
      ? options.selectedYear!
      : (latestInRange?.year ??
        options.periodRange?.endYear ??
        latest?.year ??
        new Date().getFullYear());

  const selectedMonth = boundedMonth(
    options.selectedMonth,
    latestInRange && latestInRange.year === selectedYear
      ? latestInRange.month
      : options.periodRange && options.periodRange.endYear === selectedYear
        ? options.periodRange.endMonth
        : latest?.year === selectedYear
          ? latest.month
          : IDP_DEFAULT_MONTH_END,
  );

  const historyStartYear =
    Number.isInteger(options.historyStartYear) && (options.historyStartYear ?? 0) >= 2000
      ? options.historyStartYear!
      : (options.periodRange?.startYear ?? selectedYear);
  const historyEndYear =
    Number.isInteger(options.historyEndYear) && (options.historyEndYear ?? 0) >= 2000
      ? options.historyEndYear!
      : (options.periodRange?.endYear ?? selectedYear);
  const historyMonthStartRaw = boundedMonth(
    options.historyMonthStart,
    options.periodRange?.startMonth ?? IDP_DEFAULT_MONTH_START,
  );
  const historyMonthEndRaw = boundedMonth(
    options.historyMonthEnd,
    options.periodRange?.endMonth ?? selectedMonth,
  );
  const historyRange = normalizePeriodRange({
    startYear: historyStartYear,
    startMonth: historyMonthStartRaw,
    endYear: historyEndYear,
    endMonth: historyMonthEndRaw,
  });

  const competenceEntries = recordsInCompetence(entries, selectedYear, selectedMonth);
  const activeEntries = selectLatestRsoByUnit(competenceEntries);
  const includedEntries = activeEntries.filter(
    (entry) => !excludeSet.has(normalizeIdpUnitCode(entry.unit)),
  );
  const unitRows = buildUnitRows(activeEntries, excludeSet);
  const includedUnitRows = unitRows.filter((unit) => !unit.excluded);
  const disciplineRows = buildDisciplineRows(includedEntries, excludedDisciplines);
  const unitDetails = buildUnitDetails(activeEntries, excludedDisciplines);
  const aderenciaGeral = includedUnitRows.length
    ? average(includedUnitRows.map((unit) => unit.aderencia))
    : 0;

  return {
    threshold,
    excludedUnits: excludedNormalized,
    selectedYear,
    selectedMonth,
    historyStartYear: historyRange.startYear,
    historyMonthStart: historyRange.startMonth,
    historyEndYear: historyRange.endYear,
    historyMonthEnd: historyRange.endMonth,
    aderenciaGeral,
    unitRows,
    disciplineRows,
    unitDetails,
    unitNames: activeEntries.map((entry) => entry.unit),
    activeDocuments: activeEntries.length,
    totalPrevistoMedio: includedUnitRows.reduce((sum, unit) => sum + unit.prevAcum, 0),
    totalRealMedio: includedUnitRows.reduce((sum, unit) => sum + unit.realAcum, 0),
    monthly: monthlyResult(entries, historyRange, excludeSet),
  };
}

/** Alias preservado para integrações existentes. */
export const computeIdpDetailedResult = computeIdpResult;

export function meetsTarget(adherence: number, threshold: number): boolean {
  return adherence >= threshold;
}

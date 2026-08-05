/**
 * Cálculos do IDP baseados nos PDFs RSO.
 *
 * Regras:
 *  - Um documento ativo por unidade: o maior número de RSO disponível até a
 *    competência consultada.
 *  - Execução geral da unidade: média das fases encontradas no documento.
 *  - Aderência da unidade: realizado acumulado / previsto acumulado.
 *  - Consolidado por disciplina: média simples de todas as áreas disponíveis
 *    em todas as unidades ativas.
 *  - Aderência geral: média simples das aderências das unidades ativas.
 *  - Série mensal: posição acumulada no fechamento de cada mês selecionado.
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
} from "@/features/idp/types";
import { MONTH_NAMES } from "@/lib/dates";

export interface IdpPeriodOptions {
  selectedYear?: number;
  monthStart?: number;
  monthEnd?: number;
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

function referenceTime(record: IdpNormalizedRecord): number {
  const parsed = new Date(`${record.referenceDate}T12:00:00Z`).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Seleciona o RSO vigente de cada unidade dentro dos documentos recebidos. */
export function selectLatestRsoByUnit(
  entries: readonly IdpNormalizedRecord[],
): IdpNormalizedRecord[] {
  const latestByUnit = new Map<string, IdpNormalizedRecord>();

  for (const entry of entries) {
    const unit = String(entry.unit ?? "").trim();
    if (!unit) continue;

    const current = latestByUnit.get(unit);
    if (!current) {
      latestByUnit.set(unit, entry);
      continue;
    }

    const currentNumber = current.rsoNumero ?? Number.NEGATIVE_INFINITY;
    const nextNumber = entry.rsoNumero ?? Number.NEGATIVE_INFINITY;
    const isNewerNumber = nextNumber > currentNumber;
    const isSameNumberAndNewerDate =
      nextNumber === currentNumber && referenceTime(entry) > referenceTime(current);

    if (isNewerNumber || isSameNumberAndNewerDate) latestByUnit.set(unit, entry);
  }

  return Array.from(latestByUnit.values()).sort((a, b) =>
    a.unit.localeCompare(b.unit, "pt-BR"),
  );
}

function average(values: readonly number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function buildUnitRows(activeEntries: readonly IdpNormalizedRecord[]) {
  return activeEntries.map((entry) => {
    const fases = entry.execucaoFases ?? [];
    const prevAcum = average(fases.map((phase) => Number(phase.prevAcum) || 0));
    const realAcum = average(fases.map((phase) => Number(phase.realAcum) || 0));

    return {
      sourceId: entry.id,
      unit: entry.unit,
      rsoNumero: entry.rsoNumero,
      referenceDate: entry.referenceDate,
      fileName: entry.fileName,
      prevAcum,
      realAcum,
      aderencia: calculateIdpAdherence(realAcum, prevAcum),
      nFases: fases.length,
      fases,
    };
  });
}

function endOfMonthUtc(year: number, month: number): number {
  return Date.UTC(year, month, 0, 23, 59, 59, 999);
}

function recordsAvailableAt(
  entries: readonly IdpNormalizedRecord[],
  year: number,
  month: number,
): IdpNormalizedRecord[] {
  const limit = endOfMonthUtc(year, month);
  return entries.filter((entry) => referenceTime(entry) <= limit);
}

function monthlyResult(
  entries: readonly IdpNormalizedRecord[],
  selectedYear: number,
  monthStart: number,
  monthEnd: number,
): IdpMonthlyAggregate[] {
  const rows: IdpMonthlyAggregate[] = [];

  for (let month = monthStart; month <= monthEnd; month += 1) {
    const activeEntries = selectLatestRsoByUnit(recordsAvailableAt(entries, selectedYear, month));
    const unitRows = buildUnitRows(activeEntries);
    rows.push({
      year: selectedYear,
      month,
      label: `${MONTH_NAMES[month - 1] ?? month}/${selectedYear}`,
      aderencia: unitRows.length ? average(unitRows.map((unit) => unit.aderencia)) : null,
      activeDocuments: unitRows.length,
      totalPrevistoMedio: unitRows.reduce((sum, unit) => sum + unit.prevAcum, 0),
      totalRealMedio: unitRows.reduce((sum, unit) => sum + unit.realAcum, 0),
    });
  }

  return rows;
}

function boundedMonth(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(12, Math.trunc(value ?? fallback)));
}

function resolveYear(entries: readonly IdpNormalizedRecord[], requested?: number): number {
  if (Number.isInteger(requested) && (requested ?? 0) >= 2000 && (requested ?? 0) <= 2100) {
    return requested!;
  }
  const years = entries
    .map((entry) => Number(entry.referenceDate.slice(0, 4)))
    .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100);
  return years.length ? Math.max(...years) : new Date().getFullYear();
}

export function computeIdpResult(
  entries: readonly IdpNormalizedRecord[],
  threshold: number = IDP_DEFAULT_TARGET,
  excludedDisciplines: readonly string[] = [],
  options: IdpPeriodOptions = {},
): IdpDetailedResult {
  const selectedYear = resolveYear(entries, options.selectedYear);
  let monthStart = boundedMonth(options.monthStart, IDP_DEFAULT_MONTH_START);
  let monthEnd = boundedMonth(options.monthEnd, IDP_DEFAULT_MONTH_END);
  if (monthEnd < monthStart) [monthStart, monthEnd] = [monthEnd, monthStart];

  const availableEntries = recordsAvailableAt(entries, selectedYear, monthEnd);
  const activeEntries = selectLatestRsoByUnit(availableEntries);
  const unitRows = buildUnitRows(activeEntries);
  const disciplineRows = buildDisciplineRows(activeEntries, excludedDisciplines);
  const unitDetails = buildUnitDetails(activeEntries, excludedDisciplines);
  const aderenciaGeral = average(unitRows.map((unit) => unit.aderencia));

  return {
    threshold,
    selectedYear,
    monthStart,
    monthEnd,
    aderenciaGeral,
    unitRows,
    disciplineRows,
    unitDetails,
    unitNames: activeEntries.map((entry) => entry.unit),
    activeDocuments: activeEntries.length,
    totalPrevistoMedio: unitRows.reduce((sum, unit) => sum + unit.prevAcum, 0),
    totalRealMedio: unitRows.reduce((sum, unit) => sum + unit.realAcum, 0),
    monthly: monthlyResult(entries, selectedYear, monthStart, monthEnd),
  };
}

/** Alias mantido para integrações que importavam o nome antigo. */
export const computeIdpDetailedResult = computeIdpResult;

export function meetsTarget(adherence: number, threshold: number): boolean {
  return adherence >= threshold;
}

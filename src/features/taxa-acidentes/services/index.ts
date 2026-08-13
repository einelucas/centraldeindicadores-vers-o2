import type { Prisma } from "@prisma/client";
import { computeAccidentRateResult } from "@/features/taxa-acidentes/calculations";
import {
  ACCIDENT_RATE_DEFAULT_TARGET,
  type AccidentMonthlyRecord,
  type AccidentUnitRecord,
} from "@/features/taxa-acidentes/types";
import { normalizeForMatch } from "@/lib/normalization";
import {
  compareAccidentUnits,
  normalizeAccidentUnitCode,
} from "@/features/taxa-acidentes/utils/units";
import { toJsonValue } from "@/server/database/json";

export const ACCIDENT_TARGET_SETTING_KEY = "taxa-acidentes.target";
export const ACCIDENT_EXCLUDED_SETTING_KEY = "taxa-acidentes.excludedUnits";

export function accidentUnitKey(unit: string): string {
  return normalizeForMatch(normalizeAccidentUnitCode(unit));
}

export async function loadAccidentTarget(tx: Prisma.TransactionClient): Promise<number> {
  const setting = await tx.appSetting.findUnique({
    where: { key: ACCIDENT_TARGET_SETTING_KEY },
    select: { value: true },
  });
  const configured = Number(setting?.value);
  return Number.isFinite(configured) && configured >= 0 ? configured : ACCIDENT_RATE_DEFAULT_TARGET;
}

export async function saveAccidentTarget(
  tx: Prisma.TransactionClient,
  target: number,
): Promise<void> {
  await tx.appSetting.upsert({
    where: { key: ACCIDENT_TARGET_SETTING_KEY },
    create: { key: ACCIDENT_TARGET_SETTING_KEY, value: toJsonValue(target) },
    update: { value: toJsonValue(target) },
  });
}

export function normalizeExcludedUnits(values: readonly string[]): string[] {
  return Array.from(new Set(values.map(normalizeAccidentUnitCode).filter(Boolean)));
}

export async function loadAccidentExcludedUnits(tx: Prisma.TransactionClient): Promise<string[]> {
  const setting = await tx.appSetting.findUnique({
    where: { key: ACCIDENT_EXCLUDED_SETTING_KEY },
    select: { value: true },
  });
  return Array.isArray(setting?.value)
    ? normalizeExcludedUnits(setting.value.map((value) => String(value)))
    : [];
}

export async function saveAccidentExcludedUnits(
  tx: Prisma.TransactionClient,
  excludedUnits: readonly string[],
): Promise<string[]> {
  const normalized = normalizeExcludedUnits(excludedUnits);
  await tx.appSetting.upsert({
    where: { key: ACCIDENT_EXCLUDED_SETTING_KEY },
    create: { key: ACCIDENT_EXCLUDED_SETTING_KEY, value: toJsonValue(normalized) },
    update: { value: toJsonValue(normalized) },
  });
  return normalized;
}

export function monthlyRowsToRecords(
  rows: readonly {
    id: string;
    year: number;
    month: number;
    rate: number;
    caf: number;
  }[],
): AccidentMonthlyRecord[] {
  return rows.map((row) => ({ ...row }));
}

export function unitRowsToRecords(
  rows: readonly {
    id: string;
    year: number;
    month: number;
    unit: string;
    unitKey: string;
    saf: number;
    caf: number;
  }[],
): AccidentUnitRecord[] {
  return rows
    .map((row) => {
      const unit = normalizeAccidentUnitCode(row.unit || row.unitKey);
      return { ...row, unit, unitKey: accidentUnitKey(unit) };
    })
    .sort((a, b) => a.year - b.year || a.month - b.month || compareAccidentUnits(a.unit, b.unit));
}

export async function loadAccidentRateData(tx: Prisma.TransactionClient) {
  const [monthlyRows, unitRows, target, excludedUnits] = await Promise.all([
    tx.accidentMonthlyRecord.findMany({
      orderBy: [{ year: "asc" }, { month: "asc" }],
      select: { id: true, year: true, month: true, rate: true, caf: true },
    }),
    tx.accidentUnitRecord.findMany({
      orderBy: [{ year: "asc" }, { month: "asc" }, { unit: "asc" }],
      select: {
        id: true,
        year: true,
        month: true,
        unit: true,
        unitKey: true,
        saf: true,
        caf: true,
      },
    }),
    loadAccidentTarget(tx),
    loadAccidentExcludedUnits(tx),
  ]);

  const monthly = monthlyRowsToRecords(monthlyRows);
  const units = unitRowsToRecords(unitRows);
  const result = computeAccidentRateResult(monthly, units, target, excludedUnits);

  return { monthly, units, target, excludedUnits, result };
}

export async function saveAccidentIndicatorResult(
  tx: Prisma.TransactionClient,
  result: ReturnType<typeof computeAccidentRateResult>,
): Promise<void> {
  if (result.result === null || result.latestYear === null || result.latestMonth === null) {
    return;
  }

  const adherence = result.result > 0 ? result.target / result.result : 1;

  await tx.indicatorResult.upsert({
    where: {
      module_indicator_unit_year_month: {
        module: "taxa-acidentes",
        indicator: "taxa",
        unit: "__ALL__",
        year: result.latestYear,
        month: result.latestMonth,
      },
    },
    create: {
      module: "taxa-acidentes",
      indicator: "taxa",
      unit: "__ALL__",
      year: result.latestYear,
      month: result.latestMonth,
      value: result.result,
      target: result.target,
      adherence,
      status: result.result <= result.target ? "OK" : "ACIMA",
      details: toJsonValue({
        totalCaf: result.totalCaf,
        totalUnitCaf: result.totalUnitCaf,
        totalSaf: result.totalSaf,
        latestRate: result.latestRate,
        monthsCount: result.monthsCount,
      }),
    },
    update: {
      value: result.result,
      target: result.target,
      adherence,
      status: result.result <= result.target ? "OK" : "ACIMA",
      details: toJsonValue({
        totalCaf: result.totalCaf,
        totalUnitCaf: result.totalUnitCaf,
        totalSaf: result.totalSaf,
        latestRate: result.latestRate,
        monthsCount: result.monthsCount,
      }),
    },
  });
}

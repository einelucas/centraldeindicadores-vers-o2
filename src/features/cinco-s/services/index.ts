/** Serviço do 5S no backend. */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import {
  fiveSRecordSchema,
  type FiveSRecordInput,
} from "@/features/cinco-s/schemas";
import {
  fiveSBusinessKey,
  fiveSContentHash,
} from "@/features/cinco-s/utils/keys";
import { computeFiveSResult } from "@/features/cinco-s/calculations";
import { loadFiveSRecords } from "@/features/cinco-s/repositories";
import {
  FIVES_DEFAULT_TARGET,
  FIVES_DEFAULT_EXCLUDED,
  type FiveSArea,
  type FiveSNormalizedRecord,
} from "@/features/cinco-s/types";
import type { IncrementalRecord } from "@/importers/shared/incremental-upsert";
import { normalizeFiveSUnitCode } from "@/features/cinco-s/utils/units";

export const FIVES_EXCLUDED_SETTING = "fiveS.excludedUnits";
export const FIVES_TARGET_SETTING = "fiveS.target";

export function normalizeExcludedUnits(values: readonly string[]): string[] {
  return Array.from(
    new Set(values.map(normalizeFiveSUnitCode).filter(Boolean)),
  );
}

export function toIncrementalRecords(rawRecords: unknown[]): {
  records: IncrementalRecord[];
  rejected: number;
} {
  const records: IncrementalRecord[] = [];
  let rejected = 0;
  for (const raw of rawRecords) {
    const parsed = fiveSRecordSchema.safeParse(raw);
    if (!parsed.success) {
      rejected++;
      continue;
    }
    const input: FiveSRecordInput = parsed.data;
    const record: FiveSNormalizedRecord = {
      unit: normalizeFiveSUnitCode(input.unit),
      year: input.year,
      month: input.month,
      areas: input.areas as FiveSArea[],
      raw: input.raw,
    };
    records.push({
      businessKey: fiveSBusinessKey(record),
      contentHash: fiveSContentHash(record),
      data: record as unknown as Record<string, unknown>,
    });
  }
  return { records, rejected };
}

export async function loadFiveSConfiguration(
  tx: Prisma.TransactionClient,
): Promise<{ threshold: number; excludedUnits: string[] }> {
  const settings = await tx.appSetting.findMany({
    where: { key: { in: [FIVES_EXCLUDED_SETTING, FIVES_TARGET_SETTING] } },
  });
  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]));

  const targetValue = byKey.get(FIVES_TARGET_SETTING);
  const threshold =
    typeof targetValue === "number" &&
    Number.isFinite(targetValue) &&
    targetValue >= 0 &&
    targetValue <= 1
      ? targetValue
      : FIVES_DEFAULT_TARGET;

  const excludedValue = byKey.get(FIVES_EXCLUDED_SETTING);
  const excludedUnits = Array.isArray(excludedValue)
    ? normalizeExcludedUnits(excludedValue.map((value) => String(value)))
    : [...FIVES_DEFAULT_EXCLUDED];

  return { threshold, excludedUnits };
}

export async function recalcFiveSIndicators(
  tx: Prisma.TransactionClient,
): Promise<void> {
  const rows = await loadFiveSRecords(tx);
  const records: FiveSNormalizedRecord[] = rows.map((row) => {
    const raw = (row.raw as Record<string, unknown>) ?? {};
    const areas = (raw.areas as FiveSArea[] | undefined) ?? [];
    return {
      unit: row.unit,
      year: row.year,
      month: row.month,
      areas,
      raw,
    };
  });

  const configuration = await loadFiveSConfiguration(tx);
  const result = computeFiveSResult(
    records,
    configuration.excludedUnits,
    configuration.threshold,
  );

  // Recria apenas os meses reais presentes no cálculo. Meses sem unidade
  // elegível não recebem um zero artificial.
  await tx.indicatorResult.deleteMany({ where: { module: "cinco-s" } });

  for (const month of result.months) {
    if (month.geral === null) continue;
    await tx.indicatorResult.create({
      data: {
        module: "cinco-s",
        indicator: "aderencia",
        unit: "__ALL__",
        year: month.year,
        month: month.month,
        value: month.geral,
        target: configuration.threshold,
        adherence: month.geral,
        status: month.geral >= configuration.threshold ? "OK" : "ABAIXO",
        details: toJsonValue({ unidades: month.unitsCount }),
      },
    });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { computeFiveSResult } from "@/features/cinco-s/calculations";
import {
  FIVES_DEFAULT_EXCLUDED,
  FIVES_DEFAULT_TARGET,
  type FiveSArea,
  type FiveSNormalizedRecord,
} from "@/features/cinco-s/types";
import {
  FIVES_EXCLUDED_SETTING,
  FIVES_TARGET_SETTING,
  normalizeExcludedUnits,
  recalcFiveSIndicators,
} from "@/features/cinco-s/services";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { toJsonValue } from "@/server/database/json";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

const settingsSchema = z.object({
  target: z.number().min(0).max(100),
  excludedUnits: z.array(z.string().max(100)).max(100),
});

function recordsFromRows(
  rows: Array<{ unit: string; year: number; month: number; raw: unknown }>,
): FiveSNormalizedRecord[] {
  return rows.map((row) => {
    const raw = (row.raw as Record<string, unknown>) ?? {};
    return {
      unit: row.unit,
      year: row.year,
      month: row.month,
      areas: (raw.areas as FiveSArea[] | undefined) ?? [],
      raw,
    };
  });
}

async function readSettings(): Promise<{
  threshold: number;
  excludedUnits: string[];
}> {
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: [FIVES_EXCLUDED_SETTING, FIVES_TARGET_SETTING] } },
  });
  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]));
  const target = byKey.get(FIVES_TARGET_SETTING);
  const excluded = byKey.get(FIVES_EXCLUDED_SETTING);
  return {
    threshold:
      typeof target === "number" && target >= 0 && target <= 1
        ? target
        : FIVES_DEFAULT_TARGET,
    excludedUnits: Array.isArray(excluded)
      ? normalizeExcludedUnits(excluded.map((item) => String(item)))
      : [...FIVES_DEFAULT_EXCLUDED],
  };
}

/** GET /api/cinco-s — calcula exclusivamente com os registros persistidos. */
export async function GET() {
  try {
    await requirePermission("indicators:read");
    const [rows, settings, lastImport] = await Promise.all([
      prisma.fiveSRecord.findMany({
        orderBy: [{ year: "asc" }, { month: "asc" }, { unit: "asc" }],
      }),
      readSettings(),
      prisma.importJob.findFirst({
        where: {
          module: "cinco-s",
          status: { in: ["COMPLETED", "COMPLETED_WITH_ERRORS"] },
        },
        orderBy: { completedAt: "desc" },
        select: {
          id: true,
          fileName: true,
          completedAt: true,
          totalFound: true,
          totalInserted: true,
          totalUpdated: true,
          totalIgnored: true,
          totalRejected: true,
        },
      }),
    ]);

    const records = recordsFromRows(rows);
    return NextResponse.json({
      total: rows.length,
      threshold: settings.threshold,
      excludedUnits: settings.excludedUnits,
      result: computeFiveSResult(
        records,
        settings.excludedUnits,
        settings.threshold,
      ),
      lastImport,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/cinco-s — salva regras do módulo e recalcula os meses reais. */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requirePermission("import:run");
    const input = settingsSchema.parse(await req.json());
    const excludedUnits = normalizeExcludedUnits(input.excludedUnits);
    const threshold = input.target / 100;

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.appSetting.upsert({
        where: { key: FIVES_TARGET_SETTING },
        create: { key: FIVES_TARGET_SETTING, value: toJsonValue(threshold) },
        update: { value: toJsonValue(threshold) },
      });
      await tx.appSetting.upsert({
        where: { key: FIVES_EXCLUDED_SETTING },
        create: {
          key: FIVES_EXCLUDED_SETTING,
          value: toJsonValue(excludedUnits),
        },
        update: { value: toJsonValue(excludedUnits) },
      });
      await recalcFiveSIndicators(tx);
    });

    await recordAudit({
      userId: user.id,
      action: "INDICATOR_SETTINGS_UPDATED",
      entity: "AppSetting",
      entityId: "cinco-s",
      newData: { threshold, excludedUnits },
      metadata: { module: "cinco-s" },
    });

    return NextResponse.json({ ok: true, threshold, excludedUnits });
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/cinco-s — limpa a base administrativa (somente ADMIN). */
export async function DELETE() {
  try {
    const user = await requirePermission("indicators:edit");
    const count = await prisma.fiveSRecord.count();
    if (!count) return NextResponse.json({ ok: true, deleted: 0 });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.fiveSRecord.deleteMany();
      await tx.indicatorResult.deleteMany({ where: { module: "cinco-s" } });
    });

    await recordAudit({
      userId: user.id,
      action: "RECORDS_CLEARED",
      entity: "FiveSRecord",
      previousData: { quantidade: count },
      metadata: { module: "cinco-s", escopo: "todos" },
    });

    return NextResponse.json({ ok: true, deleted: count });
  } catch (error) {
    return handleApiError(error);
  }
}

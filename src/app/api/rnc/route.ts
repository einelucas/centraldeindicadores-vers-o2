import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { computeRncResult } from "@/features/rnc/calculations";
import {
  loadRncConfiguration,
  normalizeExcludedUnits,
  recalcRncIndicators,
  RNC_EXCLUDED_SETTING,
} from "@/features/rnc/services";
import { RNC_DEFAULT_MAX_DIAS, type RncNormalizedRecord } from "@/features/rnc/types";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { toJsonValue } from "@/server/database/json";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

function parseMeta(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : RNC_DEFAULT_MAX_DIAS;
}

/**
 * GET /api/rnc — calcula o módulo exclusivamente com todos os registros
 * persistidos no Neon. Não aplica limite de 5.000 linhas ao cálculo.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:read");
    const metaDias = parseMeta(req.nextUrl.searchParams.get("meta"));

    const [rows, configuration, lastImport] = await Promise.all([
      prisma.rncRecord.findMany({
        orderBy: [{ dataCriacao: "asc" }, { unidade: "asc" }],
      }),
      prisma.$transaction((tx) => loadRncConfiguration(tx)),
      prisma.importJob.findFirst({
        where: {
          module: "rnc",
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

    const records: RncNormalizedRecord[] = rows.map((row) => ({
      statusRnc: row.statusRnc,
      unidade: row.unidade,
      dataCriacao: row.dataCriacao,
      dataSolucao: row.dataSolucao,
      tempoTratativa: row.tempoTratativa,
      ofensor: row.ofensor,
      year: row.year,
      month: row.month,
      raw: (row.raw as Record<string, unknown>) ?? {},
    }));

    return NextResponse.json({
      total: rows.length,
      metaDias,
      result: computeRncResult(records, metaDias, configuration.excludedUnits),
      lastImport,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  excludedUnits: z.array(z.string().max(100)).max(100),
});

/** PATCH /api/rnc — salva as unidades ignoradas e recalcula o indicador. */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requirePermission("import:run");
    const input = patchSchema.parse(await req.json());
    const excludedUnits = normalizeExcludedUnits(input.excludedUnits);

    await prisma.$transaction(
      async (tx) => {
        await tx.appSetting.upsert({
          where: { key: RNC_EXCLUDED_SETTING },
          create: { key: RNC_EXCLUDED_SETTING, value: toJsonValue(excludedUnits) },
          update: { value: toJsonValue(excludedUnits) },
        });
        await recalcRncIndicators(tx);
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    await recordAudit({
      userId: user.id,
      action: "INDICATOR_SETTINGS_UPDATED",
      entity: "AppSetting",
      entityId: "rnc",
      newData: { excludedUnits },
      metadata: { module: "rnc" },
    });

    return NextResponse.json({ ok: true, excludedUnits });
  } catch (error) {
    return handleApiError(error);
  }
}

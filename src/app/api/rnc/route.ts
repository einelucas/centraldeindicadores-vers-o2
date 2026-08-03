import { NextRequest, NextResponse } from "next/server";
import { computeRncResult } from "@/features/rnc/calculations";
import {
  RNC_DEFAULT_MAX_DIAS,
  type RncNormalizedRecord,
} from "@/features/rnc/types";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

function parseMeta(value: string | null): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : RNC_DEFAULT_MAX_DIAS;
}

/**
 * GET /api/rnc — calcula o módulo exclusivamente com todos os registros
 * persistidos no Neon. Não aplica limite de 5.000 linhas ao cálculo.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:read");
    const metaDias = parseMeta(req.nextUrl.searchParams.get("meta"));

    const [rows, lastImport] = await Promise.all([
      prisma.rncRecord.findMany({
        orderBy: [{ dataCriacao: "asc" }, { unidade: "asc" }],
      }),
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
      result: computeRncResult(records, metaDias),
      lastImport,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

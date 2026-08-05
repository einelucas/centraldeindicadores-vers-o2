import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { computeIdpResult } from "@/features/idp/calculations";
import { loadIdpExcludedDisciplines } from "@/features/idp/configuration";
import { storedIdpRowToRecord } from "@/features/idp/services";
import {
  IDP_DEFAULT_MONTH_END,
  IDP_DEFAULT_MONTH_START,
  IDP_DEFAULT_TARGET,
} from "@/features/idp/types";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

function isMissingRsoTable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code);
}

function boundedMonth(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(12, Math.trunc(parsed)));
}

function selectedYearFrom(value: string | null, years: number[]): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100) return parsed;
  return years[0] ?? new Date().getFullYear();
}

/** GET /api/idp — dados administrativos calculados dos RSOs persistidos. */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:read");
    const { searchParams } = new URL(req.url);
    const thresholdRaw = Number(searchParams.get("threshold"));
    const threshold = Number.isFinite(thresholdRaw)
      ? Math.max(0, Math.min(2, thresholdRaw / 100))
      : IDP_DEFAULT_TARGET;

    const [rows, lastImport, excludedDisciplines] = await Promise.all([
      prisma.idpRsoRecord.findMany({
        orderBy: [{ referenceDate: "desc" }, { unit: "asc" }, { rsoNumero: "desc" }],
      }),
      prisma.importJob.findFirst({
        where: {
          module: "idp",
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
      loadIdpExcludedDisciplines(prisma),
    ]);

    const records = rows.map(storedIdpRowToRecord);
    const years = Array.from(
      new Set(rows.map((row) => row.referenceDate.getUTCFullYear())),
    ).sort((a, b) => b - a);
    const selectedYear = selectedYearFrom(searchParams.get("year"), years);
    let monthStart = boundedMonth(searchParams.get("monthStart"), IDP_DEFAULT_MONTH_START);
    let monthEnd = boundedMonth(searchParams.get("monthEnd"), IDP_DEFAULT_MONTH_END);
    if (monthEnd < monthStart) [monthStart, monthEnd] = [monthEnd, monthStart];

    const result = computeIdpResult(records, threshold, excludedDisciplines, {
      selectedYear,
      monthStart,
      monthEnd,
    });
    const activeIds = new Set(result.unitRows.map((row) => row.sourceId).filter(Boolean));

    return NextResponse.json({
      total: records.length,
      activeTotal: result.activeDocuments,
      threshold,
      years: years.length ? years : [selectedYear],
      selectedYear,
      monthStart,
      monthEnd,
      excludedDisciplines,
      result,
      documents: rows.map((row) => ({
        id: row.id,
        unit: row.unit,
        rsoNumero: row.rsoNumero,
        referenceDate: row.referenceDate.toISOString().slice(0, 10),
        fileName: row.fileName,
        areas: Array.isArray(row.areas) ? row.areas.length : 0,
        active: activeIds.has(row.id),
        updatedAt: row.updatedAt.toISOString(),
      })),
      lastImport,
    });
  } catch (error) {
    if (isMissingRsoTable(error)) {
      const selectedYear = new Date().getFullYear();
      return NextResponse.json({
        total: 0,
        activeTotal: 0,
        threshold: IDP_DEFAULT_TARGET,
        years: [selectedYear],
        selectedYear,
        monthStart: IDP_DEFAULT_MONTH_START,
        monthEnd: IDP_DEFAULT_MONTH_END,
        excludedDisciplines: [],
        result: computeIdpResult([], IDP_DEFAULT_TARGET, [], { selectedYear }),
        documents: [],
        lastImport: null,
        setupRequired: true,
      });
    }
    return handleApiError(error);
  }
}

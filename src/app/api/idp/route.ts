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
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2021", "P2022"].includes(error.code)
  );
}

function boundedMonth(value: string | null, fallback: number): number {
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(1, Math.min(12, parsed));
}

function dateIso(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** GET /api/idp — controle administrativo e cálculo exato por competência. */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:read");
    const { searchParams } = new URL(req.url);
    const thresholdParam = searchParams.get("threshold");
    const thresholdRaw = thresholdParam === null || thresholdParam.trim() === ""
      ? Number.NaN
      : Number(thresholdParam);
    const threshold = Number.isFinite(thresholdRaw)
      ? Math.max(0, Math.min(2, thresholdRaw / 100))
      : IDP_DEFAULT_TARGET;

    const [rows, lastImport, excludedDisciplines] = await Promise.all([
      prisma.idpRsoRecord.findMany({
        orderBy: [
          { referenceYear: "desc" },
          { referenceMonth: "desc" },
          { unit: "asc" },
          { rsoNumero: "desc" },
        ],
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

    const importIds = Array.from(new Set(rows.flatMap((row) => [row.firstImportId, row.lastImportId])));
    const importJobs = importIds.length
      ? await prisma.importJob.findMany({
          where: { id: { in: importIds } },
          select: { id: true, user: { select: { name: true } } },
        })
      : [];
    const importUserById = new Map(importJobs.map((job) => [job.id, job.user.name]));

    const records = rows.map(storedIdpRowToRecord);
    const years = Array.from(new Set(rows.map((row) => row.referenceYear))).sort(
      (a, b) => b - a,
    );
    const latest = rows[0]
      ? { year: rows[0].referenceYear, month: rows[0].referenceMonth }
      : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };

    const requestedYearParam = searchParams.get("year");
    const requestedYear = requestedYearParam === null || requestedYearParam.trim() === ""
      ? Number.NaN
      : Number(requestedYearParam);
    const selectedYear =
      Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2200
        ? requestedYear
        : latest.year;

    const monthsForYear = rows
      .filter((row) => row.referenceYear === selectedYear)
      .map((row) => row.referenceMonth);
    const latestMonthForYear = monthsForYear.length
      ? Math.max(...monthsForYear)
      : latest.month;
    const selectedMonth = boundedMonth(searchParams.get("month"), latestMonthForYear);

    let historyMonthStart = boundedMonth(
      searchParams.get("historyStart"),
      IDP_DEFAULT_MONTH_START,
    );
    let historyMonthEnd = boundedMonth(
      searchParams.get("historyEnd"),
      Math.max(selectedMonth, IDP_DEFAULT_MONTH_START),
    );
    if (historyMonthEnd < historyMonthStart) {
      [historyMonthStart, historyMonthEnd] = [historyMonthEnd, historyMonthStart];
    }

    const result = computeIdpResult(records, threshold, excludedDisciplines, {
      selectedYear,
      selectedMonth,
      historyMonthStart,
      historyMonthEnd,
    });
    const activeIds = new Set(result.unitRows.map((row) => row.sourceId).filter(Boolean));

    return NextResponse.json({
      total: records.length,
      activeTotal: result.activeDocuments,
      threshold,
      years: years.length ? years : [selectedYear],
      selectedYear,
      selectedMonth,
      historyMonthStart,
      historyMonthEnd,
      excludedDisciplines,
      result,
      documents: rows.map((row) => ({
        id: row.id,
        unit: row.unit,
        detectedUnit: row.detectedUnit,
        unitAdjusted: row.unitAdjusted,
        rsoNumero: row.rsoNumero,
        detectedRsoNumero: row.detectedRsoNumero,
        rsoAdjusted: row.rsoAdjusted,
        referenceYear: row.referenceYear,
        referenceMonth: row.referenceMonth,
        detectedReferenceYear: row.detectedReferenceYear,
        detectedReferenceMonth: row.detectedReferenceMonth,
        referenceSource: row.referenceSource,
        referenceOriginalText: row.referenceOriginalText,
        referenceAdjusted: row.referenceAdjusted,
        periodStart: dateIso(row.periodStart),
        periodEnd: dateIso(row.periodEnd),
        emissionDate: dateIso(row.emissionDate),
        fileName: row.fileName,
        areas: Array.isArray(row.areas) ? row.areas.length : 0,
        active: activeIds.has(row.id),
        sameCompetence:
          row.referenceYear === selectedYear && row.referenceMonth === selectedMonth,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        firstImportedBy: importUserById.get(row.firstImportId) ?? null,
        lastUpdatedBy: importUserById.get(row.lastImportId) ?? null,
      })),
      lastImport,
    });
  } catch (error) {
    if (isMissingRsoTable(error)) {
      const selectedYear = new Date().getFullYear();
      const selectedMonth = new Date().getMonth() + 1;
      return NextResponse.json({
        total: 0,
        activeTotal: 0,
        threshold: IDP_DEFAULT_TARGET,
        years: [selectedYear],
        selectedYear,
        selectedMonth,
        historyMonthStart: IDP_DEFAULT_MONTH_START,
        historyMonthEnd: selectedMonth,
        excludedDisciplines: [],
        result: computeIdpResult([], IDP_DEFAULT_TARGET, [], {
          selectedYear,
          selectedMonth,
          historyMonthStart: IDP_DEFAULT_MONTH_START,
          historyMonthEnd: selectedMonth,
        }),
        documents: [],
        lastImport: null,
        setupRequired: true,
      });
    }
    return handleApiError(error);
  }
}

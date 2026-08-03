import { NextRequest, NextResponse } from "next/server";

type YearRow = { year: number; custoReal: number; disciplina: string };
type LoadedIdpRow = {
  unit: string;
  year: number;
  month: number;
  disciplina: string;
  custoLinhaBase: number;
  custoReal: number;
  raw: unknown;
};
import { computeIdpDetailedResult } from "@/features/idp/calculations";
import {
  filterIdpExcludedDisciplines,
  isIdpDisciplineExcluded,
  loadIdpExcludedDisciplines,
} from "@/features/idp/configuration";
import {
  IDP_DEFAULT_MONTH_END,
  IDP_DEFAULT_MONTH_START,
  IDP_DEFAULT_TARGET,
  type IdpNormalizedRecord,
} from "@/features/idp/types";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

function boundedMonth(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12
    ? parsed
    : fallback;
}

/** GET /api/idp — dados administrativos reais, calculados dos registros persistidos. */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:read");
    const { searchParams } = new URL(req.url);

    const [yearRows, lastImport, excludedDisciplines] = await Promise.all([
      prisma.idpRecord.findMany({
        select: { year: true, custoReal: true, disciplina: true },
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

    const allYearRows = yearRows as YearRow[];
    const typedYearRows = allYearRows.filter(
      (row) => !isIdpDisciplineExcluded(row.disciplina, excludedDisciplines),
    );
    const years: number[] = Array.from(
      new Set(allYearRows.map((row) => row.year)),
    ).sort((a, b) => a - b);
    const realByYear = new Map<number, number>();
    for (const row of typedYearRows) {
      realByYear.set(row.year, (realByYear.get(row.year) ?? 0) + row.custoReal);
    }

    let defaultYear = years.includes(2026) ? 2026 : years.at(-1) ?? 2026;
    if (!years.includes(2026) && years.length) {
      defaultYear = years.reduce((best, year) =>
        (realByYear.get(year) ?? 0) > (realByYear.get(best) ?? 0) ? year : best,
      );
    }

    const requestedYear = Number(searchParams.get("year"));
    const selectedYear =
      Number.isInteger(requestedYear) && years.includes(requestedYear)
        ? requestedYear
        : defaultYear;

    let monthStart = boundedMonth(
      searchParams.get("monthStart"),
      IDP_DEFAULT_MONTH_START,
    );
    let monthEnd = boundedMonth(
      searchParams.get("monthEnd"),
      IDP_DEFAULT_MONTH_END,
    );
    if (monthEnd < monthStart) [monthStart, monthEnd] = [monthEnd, monthStart];

    const thresholdRaw = Number(searchParams.get("threshold"));
    const threshold = Number.isFinite(thresholdRaw)
      ? Math.max(0, Math.min(2, thresholdRaw / 100))
      : IDP_DEFAULT_TARGET;

    const rows = await prisma.idpRecord.findMany({
      where: {
        year: selectedYear,
        month: { gte: monthStart, lte: monthEnd },
      },
      orderBy: [{ unit: "asc" }, { disciplina: "asc" }, { month: "asc" }],
    });

    const allRecords: IdpNormalizedRecord[] = (rows as LoadedIdpRow[]).map((row) => ({
      unit: row.unit,
      year: row.year,
      month: row.month,
      disciplina: row.disciplina,
      custoLinhaBase: row.custoLinhaBase,
      custoReal: row.custoReal,
      raw: (row.raw as Record<string, unknown>) ?? {},
    }));
    const records = filterIdpExcludedDisciplines(allRecords, excludedDisciplines);

    const result = computeIdpDetailedResult(records, {
      year: selectedYear,
      monthStart,
      monthEnd,
      threshold,
    });

    return NextResponse.json({
      total: records.length,
      totalImportedInPeriod: rows.length,
      excludedTotal: rows.length - records.length,
      excludedDisciplines,
      years,
      defaultYear,
      selectedYear,
      monthStart,
      monthEnd,
      threshold,
      result,
      lastImport,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

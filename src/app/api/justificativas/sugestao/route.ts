import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { computeIdpResult } from "@/features/idp/calculations";
import { computeFiveSResult } from "@/features/cinco-s/calculations";
import { loadFiveSConfiguration } from "@/features/cinco-s/services";
import type { FiveSArea, FiveSNormalizedRecord } from "@/features/cinco-s/types";
import { loadIdpExcludedDisciplines, loadIdpExcludedUnits } from "@/features/idp/configuration";
import { storedIdpRowToRecord } from "@/features/idp/services";
import { generateIdpJustification } from "@/features/justifications/generators/idp";
import { generateFiveSJustification } from "@/features/justifications/generators/cinco-s";
import { generateRdoJustification } from "@/features/justifications/generators/rdo";
import { JUSTIFICATION_MODULES } from "@/features/justifications/types";
import { loadRdoConfiguration } from "@/features/rdo/services";
import type { RdoNormalizedRecord } from "@/features/rdo/types";
import { computeRncResult } from "@/features/rnc/calculations";
import { loadRncConfiguration } from "@/features/rnc/services";
import type { RncNormalizedRecord } from "@/features/rnc/types";
import { generateRncJustification } from "@/features/justifications/generators/rnc";
import { generateAccidentRateJustification } from "@/features/justifications/generators/taxa-acidentes";
import { computeAccidentRateResult } from "@/features/taxa-acidentes/calculations";
import { loadAccidentExcludedUnits } from "@/features/taxa-acidentes/services";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

const querySchema = z.object({
  module: z.enum(JUSTIFICATION_MODULES),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  target: z.coerce.number().min(0).max(100).default(80),
});

function normalizeRows(
  rows: Array<{
    dataReferencia: Date;
    empresaNome: string;
    statusDescricao: string;
    relatorioId: string | null;
    grupo: string | null;
    disciplina: string | null;
    year: number;
    month: number;
    raw: unknown;
  }>,
): RdoNormalizedRecord[] {
  return rows.map((row) => ({
    ...row,
    raw: (row.raw as Record<string, unknown>) ?? {},
  }));
}

async function generateRdo(input: z.infer<typeof querySchema>) {
  const previousMonth = input.month === 1 ? 12 : input.month - 1;
  const previousYear = input.month === 1 ? input.year - 1 : input.year;
  const select = {
    dataReferencia: true,
    empresaNome: true,
    statusDescricao: true,
    relatorioId: true,
    grupo: true,
    disciplina: true,
    year: true,
    month: true,
    raw: true,
  } as const;

  const [rows, previousRows, configuration, sourceImport] = await Promise.all([
    prisma.rdoRecord.findMany({ where: { year: input.year, month: input.month }, select }),
    prisma.rdoRecord.findMany({
      where: { year: previousYear, month: previousMonth },
      select,
    }),
    prisma.$transaction((tx) => loadRdoConfiguration(tx)),
    prisma.importJob.findFirst({
      where: {
        module: "rdo",
        status: { in: ["COMPLETED", "COMPLETED_WITH_ERRORS"] },
        OR: [{ referenceYear: input.year, referenceMonth: input.month }, { referenceYear: null }],
      },
      orderBy: { completedAt: "desc" },
      select: { id: true, completedAt: true },
    }),
  ]);

  return generateRdoJustification({
    records: normalizeRows(rows),
    previousRecords: normalizeRows(previousRows),
    year: input.year,
    month: input.month,
    threshold: input.target / 100,
    excludedUnits: configuration.excludedUnits,
    sourceImport: sourceImport
      ? { id: sourceImport.id, importedAt: sourceImport.completedAt?.toISOString() ?? null }
      : null,
  });
}

async function generateIdp(input: z.infer<typeof querySchema>) {
  const previousMonth = input.month === 1 ? 12 : input.month - 1;
  const previousYear = input.month === 1 ? input.year - 1 : input.year;
  const [rows, excludedDisciplines, excludedUnits, sourceImport] = await Promise.all([
    prisma.idpRsoRecord.findMany({
      where: {
        OR: [
          { referenceYear: input.year, referenceMonth: input.month },
          { referenceYear: previousYear, referenceMonth: previousMonth },
        ],
      },
    }),
    loadIdpExcludedDisciplines(prisma),
    loadIdpExcludedUnits(prisma),
    prisma.importJob.findFirst({
      where: {
        module: "idp",
        referenceYear: input.year,
        referenceMonth: input.month,
        status: { in: ["COMPLETED", "COMPLETED_WITH_ERRORS"] },
      },
      orderBy: { completedAt: "desc" },
      select: { id: true, completedAt: true },
    }),
  ]);
  const records = rows.map(storedIdpRowToRecord);
  const threshold = input.target / 100;
  const result = computeIdpResult(
    records,
    threshold,
    excludedDisciplines,
    {
      selectedYear: input.year,
      selectedMonth: input.month,
      historyStartYear: input.year,
      historyMonthStart: input.month,
      historyEndYear: input.year,
      historyMonthEnd: input.month,
    },
    excludedUnits,
  );
  const previousResult = computeIdpResult(
    records,
    threshold,
    excludedDisciplines,
    {
      selectedYear: previousYear,
      selectedMonth: previousMonth,
      historyStartYear: previousYear,
      historyMonthStart: previousMonth,
      historyEndYear: previousYear,
      historyMonthEnd: previousMonth,
    },
    excludedUnits,
  );

  return generateIdpJustification({
    result,
    previousResult,
    sourceImport: sourceImport
      ? { id: sourceImport.id, importedAt: sourceImport.completedAt?.toISOString() ?? null }
      : null,
  });
}

async function generateRnc(input: z.infer<typeof querySchema>) {
  const previousMonth = input.month === 1 ? 12 : input.month - 1;
  const previousYear = input.month === 1 ? input.year - 1 : input.year;
  const [rows, configuration, sourceImport] = await Promise.all([
    prisma.rncRecord.findMany({
      where: {
        OR: [
          { year: input.year, month: input.month },
          { year: previousYear, month: previousMonth },
        ],
      },
    }),
    prisma.$transaction((tx) => loadRncConfiguration(tx)),
    prisma.importJob.findFirst({
      where: {
        module: "rnc",
        status: { in: ["COMPLETED", "COMPLETED_WITH_ERRORS"] },
        OR: [{ referenceYear: input.year, referenceMonth: input.month }, { referenceYear: null }],
      },
      orderBy: { completedAt: "desc" },
      select: { id: true, completedAt: true },
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
  const result = computeRncResult(records, input.target, configuration.excludedUnits, {
    startYear: input.year,
    startMonth: input.month,
    endYear: input.year,
    endMonth: input.month,
  });
  const previousResult = computeRncResult(records, input.target, configuration.excludedUnits, {
    startYear: previousYear,
    startMonth: previousMonth,
    endYear: previousYear,
    endMonth: previousMonth,
  });

  return generateRncJustification({
    result,
    previousResult,
    year: input.year,
    month: input.month,
    sourceImport: sourceImport
      ? { id: sourceImport.id, importedAt: sourceImport.completedAt?.toISOString() ?? null }
      : null,
  });
}

async function generateFiveS(input: z.infer<typeof querySchema>) {
  const previousMonth = input.month === 1 ? 12 : input.month - 1;
  const previousYear = input.month === 1 ? input.year - 1 : input.year;
  const [rows, configuration, sourceImport] = await Promise.all([
    prisma.fiveSRecord.findMany({
      where: {
        OR: [
          { year: input.year, month: input.month },
          { year: previousYear, month: previousMonth },
        ],
      },
    }),
    prisma.$transaction((tx) => loadFiveSConfiguration(tx)),
    prisma.importJob.findFirst({
      where: {
        module: "cinco-s",
        status: { in: ["COMPLETED", "COMPLETED_WITH_ERRORS"] },
        OR: [{ referenceYear: input.year, referenceMonth: input.month }, { referenceYear: null }],
      },
      orderBy: { completedAt: "desc" },
      select: { id: true, completedAt: true },
    }),
  ]);
  const records: FiveSNormalizedRecord[] = rows.map((row) => {
    const raw = (row.raw as Record<string, unknown>) ?? {};
    return {
      unit: row.unit,
      year: row.year,
      month: row.month,
      areas: (raw.areas as FiveSArea[] | undefined) ?? [],
      raw,
    };
  });
  const threshold = input.target / 100;
  const result = computeFiveSResult(records, configuration.excludedUnits, threshold, {
    startYear: input.year,
    startMonth: input.month,
    endYear: input.year,
    endMonth: input.month,
  });
  const previousResult = computeFiveSResult(records, configuration.excludedUnits, threshold, {
    startYear: previousYear,
    startMonth: previousMonth,
    endYear: previousYear,
    endMonth: previousMonth,
  });

  return generateFiveSJustification({
    result,
    previousResult,
    year: input.year,
    month: input.month,
    sourceImport: sourceImport
      ? { id: sourceImport.id, importedAt: sourceImport.completedAt?.toISOString() ?? null }
      : null,
  });
}

async function generateAccidentRate(input: z.infer<typeof querySchema>) {
  const previousMonth = input.month === 1 ? 12 : input.month - 1;
  const previousYear = input.month === 1 ? input.year - 1 : input.year;
  const [monthly, units, excludedUnits] = await Promise.all([
    prisma.accidentMonthlyRecord.findMany({
      where: {
        OR: [
          { year: input.year, month: input.month },
          { year: previousYear, month: previousMonth },
        ],
      },
      select: { year: true, month: true, rate: true, caf: true },
    }),
    prisma.accidentUnitRecord.findMany({
      where: {
        OR: [
          { year: input.year, month: input.month },
          { year: previousYear, month: previousMonth },
        ],
      },
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
    loadAccidentExcludedUnits(prisma),
  ]);
  const result = computeAccidentRateResult(monthly, units, input.target, excludedUnits, {
    startYear: input.year,
    startMonth: input.month,
    endYear: input.year,
    endMonth: input.month,
  });
  const previousResult = computeAccidentRateResult(monthly, units, input.target, excludedUnits, {
    startYear: previousYear,
    startMonth: previousMonth,
    endYear: previousYear,
    endMonth: previousMonth,
  });

  return generateAccidentRateJustification({
    result,
    previousResult,
    year: input.year,
    month: input.month,
    sourceImport: null,
  });
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission("import:run");
    const input = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const suggestion =
      input.module === "idp"
        ? await generateIdp(input)
        : input.module === "rnc"
          ? await generateRnc(input)
          : input.module === "cinco-s"
            ? await generateFiveS(input)
            : input.module === "taxa-acidentes"
              ? await generateAccidentRate(input)
              : await generateRdo(input);

    return NextResponse.json({ suggestion });
  } catch (error) {
    return handleApiError(error);
  }
}

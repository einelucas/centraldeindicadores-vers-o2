import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { availableCyclesFromMonths, type MonthReference } from "@/lib/period";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

const sourceSchema = z.enum(["scorecard", "rdo", "idp", "rnc", "cinco-s", "taxa-acidentes"]);

async function rdoMonths(): Promise<MonthReference[]> {
  return prisma.rdoRecord.findMany({
    select: { year: true, month: true },
    distinct: ["year", "month"],
  });
}

async function idpMonths(): Promise<MonthReference[]> {
  const rows = await prisma.idpRsoRecord.findMany({
    select: { referenceYear: true, referenceMonth: true },
    distinct: ["referenceYear", "referenceMonth"],
  });
  return rows.map((row) => ({ year: row.referenceYear, month: row.referenceMonth }));
}

async function rncMonths(): Promise<MonthReference[]> {
  return prisma.rncRecord.findMany({
    select: { year: true, month: true },
    distinct: ["year", "month"],
  });
}

async function fiveSMonths(): Promise<MonthReference[]> {
  return prisma.fiveSRecord.findMany({
    select: { year: true, month: true },
    distinct: ["year", "month"],
  });
}

async function accidentMonths(): Promise<MonthReference[]> {
  const [monthly, units] = await Promise.all([
    prisma.accidentMonthlyRecord.findMany({
      select: { year: true, month: true },
      distinct: ["year", "month"],
    }),
    prisma.accidentUnitRecord.findMany({
      select: { year: true, month: true },
      distinct: ["year", "month"],
    }),
  ]);
  return [...monthly, ...units];
}

async function scorecardMonths(): Promise<MonthReference[]> {
  const [rdo, idp, rnc, fiveS, accidents, snapshots] = await Promise.all([
    rdoMonths(),
    idpMonths(),
    rncMonths(),
    fiveSMonths(),
    accidentMonths(),
    prisma.scorecardSnapshot.findMany({
      select: { year: true, month: true },
      distinct: ["year", "month"],
    }),
  ]);
  return [...rdo, ...idp, ...rnc, ...fiveS, ...accidents, ...snapshots];
}

async function loadMonths(source: z.infer<typeof sourceSchema>): Promise<MonthReference[]> {
  switch (source) {
    case "rdo":
      return rdoMonths();
    case "idp":
      return idpMonths();
    case "rnc":
      return rncMonths();
    case "cinco-s":
      return fiveSMonths();
    case "taxa-acidentes":
      return accidentMonths();
    case "scorecard":
      return scorecardMonths();
  }
}

/**
 * Ciclos disponíveis no seletor do painel. A fonte são as competências dos
 * registros importados; portanto um ciclo aparece assim que seu primeiro mês
 * válido entra no banco e desaparece quando deixa de possuir dados.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:read");
    const source = sourceSchema.parse(req.nextUrl.searchParams.get("source"));
    const periods = availableCyclesFromMonths(await loadMonths(source));
    return NextResponse.json({ periods });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  formatPeriodRangeLabel,
  normalizePeriodRange,
  parsePeriodRangeParams,
  periodRangeWhere,
} from "@/lib/period";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

function missingTables(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

/**
 * GET /api/taxa-acidentes/registros — contagem de lançamentos (mensais +
 * por unidade) para um período (ou toda a base, sem período). Usado pela
 * tela de exclusão para mostrar quantos registros serão apagados antes de
 * confirmar.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:edit");
    const { searchParams } = new URL(req.url);
    const period = parsePeriodRangeParams(searchParams);
    const monthlyWhere = period
      ? (periodRangeWhere(period) as Prisma.AccidentMonthlyRecordWhereInput)
      : {};
    const unitWhere = period
      ? (periodRangeWhere(period) as Prisma.AccidentUnitRecordWhereInput)
      : {};
    const [monthlyCount, unitCount] = await Promise.all([
      prisma.accidentMonthlyRecord.count({ where: monthlyWhere }),
      prisma.accidentUnitRecord.count({ where: unitWhere }),
    ]);
    return NextResponse.json({ count: monthlyCount + unitCount });
  } catch (error) {
    if (missingTables(error)) return NextResponse.json({ count: 0 });
    return handleApiError(error);
  }
}

const deleteSchema = z.union([
  z.object({ all: z.literal(true) }),
  z.object({
    periodStartYear: z.number().int().min(2000).max(2200),
    periodStartMonth: z.number().int().min(1).max(12),
    periodEndYear: z.number().int().min(2000).max(2200),
    periodEndMonth: z.number().int().min(1).max(12),
  }),
]);

/**
 * DELETE /api/taxa-acidentes/registros — limpa os lançamentos administrativos
 * (mensais e por unidade), todos ou apenas um período específico (só ADMIN).
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:edit");
    const body = deleteSchema.parse(await req.json());

    if ("all" in body) {
      const [monthlyCount, unitCount] = await Promise.all([
        prisma.accidentMonthlyRecord.count(),
        prisma.accidentUnitRecord.count(),
      ]);
      if (monthlyCount + unitCount === 0) return NextResponse.json({ ok: true, deleted: 0 });

      await prisma.$transaction(async (tx) => {
        await tx.accidentMonthlyRecord.deleteMany();
        await tx.accidentUnitRecord.deleteMany();
        await tx.indicatorResult.deleteMany({ where: { module: "taxa-acidentes" } });
      });

      await recordAudit({
        userId: user.id,
        action: "RECORDS_CLEARED",
        entity: "AccidentRate",
        previousData: { monthlyCount, unitCount },
        metadata: { module: "taxa-acidentes", escopo: "todos" },
      });

      return NextResponse.json({ ok: true, deleted: monthlyCount + unitCount });
    }

    const range = normalizePeriodRange({
      startYear: body.periodStartYear,
      startMonth: body.periodStartMonth,
      endYear: body.periodEndYear,
      endMonth: body.periodEndMonth,
    });
    const monthlyWhere = periodRangeWhere(range) as Prisma.AccidentMonthlyRecordWhereInput;
    const unitWhere = periodRangeWhere(range) as Prisma.AccidentUnitRecordWhereInput;
    const [monthlyCount, unitCount] = await Promise.all([
      prisma.accidentMonthlyRecord.count({ where: monthlyWhere }),
      prisma.accidentUnitRecord.count({ where: unitWhere }),
    ]);
    if (monthlyCount + unitCount === 0) return NextResponse.json({ ok: true, deleted: 0 });

    await prisma.$transaction(async (tx) => {
      await tx.accidentMonthlyRecord.deleteMany({ where: monthlyWhere });
      await tx.accidentUnitRecord.deleteMany({ where: unitWhere });
    });

    await recordAudit({
      userId: user.id,
      action: "RECORDS_CLEARED",
      entity: "AccidentRate",
      previousData: { monthlyCount, unitCount },
      metadata: {
        module: "taxa-acidentes",
        escopo: "periodo",
        periodo: formatPeriodRangeLabel(range),
      },
    });

    return NextResponse.json({ ok: true, deleted: monthlyCount + unitCount });
  } catch (error) {
    if (missingTables(error)) {
      return NextResponse.json(
        { error: "Execute pnpm db:upgrade:accidents antes de remover dados." },
        { status: 503 },
      );
    }
    return handleApiError(error);
  }
}

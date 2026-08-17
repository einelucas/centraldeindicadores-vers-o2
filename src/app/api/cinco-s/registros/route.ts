import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { recalcFiveSIndicators } from "@/features/cinco-s/services";
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

/**
 * GET /api/cinco-s/registros — contagem de registros para um período (ou
 * toda a base, sem período). Usado pela tela de exclusão para mostrar
 * quantos registros serão apagados antes de confirmar.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:edit");
    const { searchParams } = new URL(req.url);
    const period = parsePeriodRangeParams(searchParams);
    const where = period ? (periodRangeWhere(period) as Prisma.FiveSRecordWhereInput) : {};
    const count = await prisma.fiveSRecord.count({ where });
    return NextResponse.json({ count });
  } catch (error) {
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
 * DELETE /api/cinco-s/registros — limpa a base administrativa do 5S, toda ou
 * apenas um período específico (só ADMIN).
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:edit");
    const body = deleteSchema.parse(await req.json());

    if ("all" in body) {
      const count = await prisma.fiveSRecord.count();
      if (count === 0) return NextResponse.json({ ok: true, deleted: 0 });

      await prisma.$transaction(async (tx) => {
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
    }

    const range = normalizePeriodRange({
      startYear: body.periodStartYear,
      startMonth: body.periodStartMonth,
      endYear: body.periodEndYear,
      endMonth: body.periodEndMonth,
    });
    const where = periodRangeWhere(range) as Prisma.FiveSRecordWhereInput;
    const count = await prisma.fiveSRecord.count({ where });
    if (count === 0) return NextResponse.json({ ok: true, deleted: 0 });

    await prisma.$transaction(
      async (tx) => {
        await tx.fiveSRecord.deleteMany({ where });
        await recalcFiveSIndicators(tx);
      },
      { maxWait: 10_000, timeout: 60_000 },
    );

    await recordAudit({
      userId: user.id,
      action: "RECORDS_CLEARED",
      entity: "FiveSRecord",
      previousData: { quantidade: count },
      metadata: { module: "cinco-s", escopo: "periodo", periodo: formatPeriodRangeLabel(range) },
    });

    return NextResponse.json({ ok: true, deleted: count });
  } catch (error) {
    return handleApiError(error);
  }
}

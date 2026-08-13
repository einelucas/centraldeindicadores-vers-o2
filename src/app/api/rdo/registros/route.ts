import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { recalcRdoIndicators } from "@/features/rdo/services";
import { RDO_STATUS } from "@/features/rdo/types";
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

const VALID_STATUS = [
  RDO_STATUS.APROVADO,
  RDO_STATUS.REVISAR,
  RDO_STATUS.PREENCHENDO,
] as const;

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(VALID_STATUS),
});

/**
 * GET /api/rdo/registros — contagem de registros para um período (ou toda a
 * base, sem período). Usado pela tela de exclusão para mostrar quantos
 * registros serão apagados antes de confirmar, independente do filtro de
 * período que estiver ativo na tela principal.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:edit");
    const { searchParams } = new URL(req.url);
    const period = parsePeriodRangeParams(searchParams);
    const where = period ? (periodRangeWhere(period) as Prisma.RdoRecordWhereInput) : {};
    const count = await prisma.rdoRecord.count({ where });
    return NextResponse.json({ count });
  } catch (error) {
    return handleApiError(error);
  }
}

/** PATCH /api/rdo/registros — edição manual de status, somente ADMIN. */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:edit");
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.rdoRecord.findUnique({
      where: { id: body.id },
      select: { id: true, statusDescricao: true, empresaNome: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
    }
    if (existing.statusDescricao === body.status) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.rdoRecord.update({
        where: { id: body.id },
        data: {
          statusDescricao: body.status,
          editedManually: true,
          editedBy: user.id,
          editedAt: new Date(),
        },
        select: { id: true, statusDescricao: true },
      });
      await recalcRdoIndicators(tx);
      return record;
    });

    await recordAudit({
      userId: user.id,
      action: "RECORD_EDITED",
      entity: "RdoRecord",
      entityId: body.id,
      previousData: { statusDescricao: existing.statusDescricao },
      newData: { statusDescricao: body.status },
      metadata: { module: "rdo", unidade: existing.empresaNome },
    });

    return NextResponse.json({ ok: true, updated });
  } catch (error) {
    return handleApiError(error);
  }
}

const deleteSchema = z.union([
  z.object({ ids: z.array(z.string().min(1)).min(1).max(500) }),
  z.object({ all: z.literal(true) }),
  z.object({
    periodStartYear: z.number().int().min(2000).max(2200),
    periodStartMonth: z.number().int().min(1).max(12),
    periodEndYear: z.number().int().min(2000).max(2200),
    periodEndMonth: z.number().int().min(1).max(12),
  }),
]);

/**
 * DELETE /api/rdo/registros — exclui IDs selecionados, um período específico
 * ou toda a base do RDO. A publicação vigente não é apagada: ela é um
 * snapshot histórico imutável.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:edit");
    const body = deleteSchema.parse(await req.json());

    if ("all" in body) {
      const count = await prisma.rdoRecord.count();
      if (count === 0) return NextResponse.json({ ok: true, deleted: 0 });

      await prisma.$transaction(async (tx) => {
        await tx.rdoRecord.deleteMany();
        await tx.indicatorResult.deleteMany({ where: { module: "rdo" } });
      });

      await recordAudit({
        userId: user.id,
        action: "RECORDS_CLEARED",
        entity: "RdoRecord",
        previousData: { quantidade: count },
        metadata: { module: "rdo", escopo: "todos" },
      });

      return NextResponse.json({ ok: true, deleted: count });
    }

    if ("periodStartYear" in body) {
      const range = normalizePeriodRange({
        startYear: body.periodStartYear,
        startMonth: body.periodStartMonth,
        endYear: body.periodEndYear,
        endMonth: body.periodEndMonth,
      });
      const where = periodRangeWhere(range) as Prisma.RdoRecordWhereInput;
      const count = await prisma.rdoRecord.count({ where });
      if (count === 0) return NextResponse.json({ ok: true, deleted: 0 });

      await prisma.$transaction(
        async (tx) => {
          await tx.rdoRecord.deleteMany({ where });
          await recalcRdoIndicators(tx);
        },
        { maxWait: 10_000, timeout: 60_000 },
      );

      await recordAudit({
        userId: user.id,
        action: "RECORDS_CLEARED",
        entity: "RdoRecord",
        previousData: { quantidade: count },
        metadata: { module: "rdo", escopo: "periodo", periodo: formatPeriodRangeLabel(range) },
      });

      return NextResponse.json({ ok: true, deleted: count });
    }

    const toDelete = await prisma.rdoRecord.findMany({
      where: { id: { in: body.ids } },
      select: {
        id: true,
        empresaNome: true,
        statusDescricao: true,
        dataReferencia: true,
      },
    });

    const result = await prisma.$transaction(async (tx) => {
      const deleted = await tx.rdoRecord.deleteMany({
        where: { id: { in: body.ids } },
      });
      await recalcRdoIndicators(tx);
      return deleted;
    });

    await recordAudit({
      userId: user.id,
      action: "RECORD_DELETED",
      entity: "RdoRecord",
      entityId: body.ids.join(","),
      previousData: {
        registros: toDelete.map((row) => ({
          id: row.id,
          unidade: row.empresaNome,
          status: row.statusDescricao,
          data: row.dataReferencia.toISOString(),
        })),
      },
      metadata: { module: "rdo", quantidade: result.count },
    });

    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (error) {
    return handleApiError(error);
  }
}

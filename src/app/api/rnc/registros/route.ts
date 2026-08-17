import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";
import { recordAudit } from "@/server/audit";
import { recalcRncIndicators } from "@/features/rnc/services";
import {
  formatPeriodRangeLabel,
  normalizePeriodRange,
  parsePeriodRangeParams,
  periodRangeWhere,
} from "@/lib/period";
import { z } from "zod";

/**
 * GET /api/rnc/registros — contagem de registros para um período (ou toda a
 * base, sem período). Usado pela tela de exclusão para mostrar quantos
 * registros serão apagados antes de confirmar.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:edit");
    const { searchParams } = new URL(req.url);
    const period = parsePeriodRangeParams(searchParams);
    const where = period ? (periodRangeWhere(period) as Prisma.RncRecordWhereInput) : {};
    const count = await prisma.rncRecord.count({ where });
    return NextResponse.json({ count });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  // Campos editáveis do RNC: status e tempo de tratativa (número).
  status: z.string().min(1).max(120).optional(),
  tempoTratativa: z.number().min(0).max(100000).nullable().optional(),
});

/**
 * PATCH /api/rnc/registros — edita status e/ou tempo de tratativa (só ADMIN).
 * Unidade, datas e ofensor não são editáveis (compõem a identidade/origem).
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:edit");
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.rncRecord.findUnique({
      where: { id: body.id },
      select: {
        id: true,
        statusRnc: true,
        tempoTratativa: true,
        unidade: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Registro não encontrado." }, { status: 404 });
    }

    const data: {
      statusRnc?: string;
      tempoTratativa?: number | null;
      editedManually: boolean;
      editedBy: string;
      editedAt: Date;
    } = {
      editedManually: true,
      editedBy: user.id,
      editedAt: new Date(),
    };
    if (body.status !== undefined) data.statusRnc = body.status;
    if (body.tempoTratativa !== undefined) data.tempoTratativa = body.tempoTratativa;

    const noChange =
      (body.status === undefined || body.status === existing.statusRnc) &&
      (body.tempoTratativa === undefined || body.tempoTratativa === existing.tempoTratativa);
    if (noChange) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    const updated = await prisma.rncRecord.update({
      where: { id: body.id },
      data,
      select: { id: true, statusRnc: true, tempoTratativa: true },
    });

    await recordAudit({
      userId: user.id,
      action: "RECORD_EDITED",
      entity: "RncRecord",
      entityId: body.id,
      previousData: {
        statusRnc: existing.statusRnc,
        tempoTratativa: existing.tempoTratativa,
      },
      newData: {
        statusRnc: updated.statusRnc,
        tempoTratativa: updated.tempoTratativa,
      },
      metadata: { module: "rnc", unidade: existing.unidade },
    });

    return NextResponse.json({ ok: true, updated });
  } catch (err) {
    return handleApiError(err);
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
 * DELETE /api/rnc/registros — exclui IDs selecionados, um período específico
 * ou toda a base do RNC (só ADMIN). A publicação vigente não é apagada: ela
 * é um snapshot histórico imutável.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:edit");
    const body = deleteSchema.parse(await req.json());

    if ("all" in body) {
      const count = await prisma.rncRecord.count();
      if (count === 0) return NextResponse.json({ ok: true, deleted: 0 });

      await prisma.$transaction(async (tx) => {
        await tx.rncRecord.deleteMany();
        await tx.indicatorResult.deleteMany({ where: { module: "rnc" } });
      });

      await recordAudit({
        userId: user.id,
        action: "RECORDS_CLEARED",
        entity: "RncRecord",
        previousData: { quantidade: count },
        metadata: { module: "rnc", escopo: "todos" },
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
      const where = periodRangeWhere(range) as Prisma.RncRecordWhereInput;
      const count = await prisma.rncRecord.count({ where });
      if (count === 0) return NextResponse.json({ ok: true, deleted: 0 });

      await prisma.$transaction(
        async (tx) => {
          await tx.rncRecord.deleteMany({ where });
          await recalcRncIndicators(tx);
        },
        { maxWait: 10_000, timeout: 60_000 },
      );

      await recordAudit({
        userId: user.id,
        action: "RECORDS_CLEARED",
        entity: "RncRecord",
        previousData: { quantidade: count },
        metadata: { module: "rnc", escopo: "periodo", periodo: formatPeriodRangeLabel(range) },
      });

      return NextResponse.json({ ok: true, deleted: count });
    }

    const toDelete = await prisma.rncRecord.findMany({
      where: { id: { in: body.ids } },
      select: {
        id: true,
        unidade: true,
        statusRnc: true,
        dataCriacao: true,
        ofensor: true,
      },
    });

    const result = await prisma.rncRecord.deleteMany({
      where: { id: { in: body.ids } },
    });

    await recordAudit({
      userId: user.id,
      action: "RECORD_DELETED",
      entity: "RncRecord",
      entityId: body.ids.join(","),
      previousData: {
        registros: toDelete.map((r) => ({
          id: r.id,
          unidade: r.unidade,
          status: r.statusRnc,
          ofensor: r.ofensor,
          dataCriacao: r.dataCriacao.toISOString(),
        })),
      },
      metadata: { module: "rnc", quantidade: result.count },
    });

    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (err) {
    return handleApiError(err);
  }
}

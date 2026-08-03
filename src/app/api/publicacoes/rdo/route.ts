import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { computeRdoResult } from "@/features/rdo/calculations";
import { toRdoPublishedPayload } from "@/features/rdo/publications";
import type { RdoNormalizedRecord } from "@/features/rdo/types";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { toJsonValue } from "@/server/database/json";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

const MODULE = "rdo";
const INDICATOR = "aprovacao";

function isMissingPublicationTable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

const publishSchema = z.object({
  threshold: z.number().min(0).max(100).default(76),
});

function serializePublication(publication: {
  id: string;
  version: number;
  target: number | null;
  result: number | null;
  status: string | null;
  payload: unknown;
  publishedAt: Date;
  publishedBy: { id: string; name: string; email: string };
}) {
  return {
    id: publication.id,
    version: publication.version,
    target: publication.target,
    result: publication.result,
    status: publication.status,
    payload: publication.payload,
    publishedAt: publication.publishedAt.toISOString(),
    publishedBy: publication.publishedBy,
  };
}

/** GET /api/publicacoes/rdo — último snapshot efetivamente publicado. */
export async function GET() {
  try {
    await requirePermission("indicators:read");

    const publication = await prisma.indicatorPublication.findFirst({
      where: { module: MODULE, indicator: INDICATOR, active: true },
      orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
      include: {
        publishedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({
      publication: publication ? serializePublication(publication) : null,
    });
  } catch (error) {
    if (isMissingPublicationTable(error)) {
      return NextResponse.json({ publication: null, setupRequired: true });
    }
    return handleApiError(error);
  }
}

/**
 * POST /api/publicacoes/rdo — calcula no servidor e cria uma versão imutável.
 * Importações posteriores não alteram o painel até uma nova publicação.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:publish");
    const input = publishSchema.parse(await req.json());
    const thresholdFraction = input.threshold / 100;

    const rows = await prisma.rdoRecord.findMany({
      orderBy: [{ dataReferencia: "asc" }, { empresaNome: "asc" }],
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Não há registros de RDO para publicar." },
        { status: 400 },
      );
    }

    const records: RdoNormalizedRecord[] = rows.map((row) => ({
      dataReferencia: row.dataReferencia,
      empresaNome: row.empresaNome,
      statusDescricao: row.statusDescricao,
      relatorioId: row.relatorioId,
      grupo: row.grupo,
      disciplina: row.disciplina,
      year: row.year,
      month: row.month,
      raw: (row.raw as Record<string, unknown>) ?? {},
    }));

    const result = computeRdoResult(records, thresholdFraction);
    const payload = toRdoPublishedPayload(result, input.threshold);
    const status = payload.resultado >= input.threshold ? "OK" : "ABAIXO";

    const publication = await prisma.$transaction(async (tx) => {
      const latest = await tx.indicatorPublication.findFirst({
        where: { module: MODULE, indicator: INDICATOR },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;

      await tx.indicatorPublication.updateMany({
        where: { module: MODULE, indicator: INDICATOR, active: true },
        data: { active: false },
      });

      return tx.indicatorPublication.create({
        data: {
          module: MODULE,
          indicator: INDICATOR,
          version,
          target: thresholdFraction,
          result: payload.resultado / 100,
          status,
          payload: toJsonValue(payload),
          active: true,
          publishedById: user.id,
        },
        include: {
          publishedBy: { select: { id: true, name: true, email: true } },
        },
      });
    });

    await recordAudit({
      userId: user.id,
      action: "INDICATOR_PUBLISHED",
      entity: "IndicatorPublication",
      entityId: publication.id,
      newData: {
        module: MODULE,
        indicator: INDICATOR,
        version: publication.version,
        target: input.threshold,
        result: payload.resultado,
        status,
      },
      metadata: {
        emitidos: payload.emitidos,
        aprovados: payload.aprovados,
      },
    });

    return NextResponse.json({ publication: serializePublication(publication) });
  } catch (error) {
    if (isMissingPublicationTable(error)) {
      return NextResponse.json(
        { error: "A tabela de publicações ainda não foi criada. Execute pnpm db:upgrade:rdo." },
        { status: 503 },
      );
    }
    return handleApiError(error);
  }
}

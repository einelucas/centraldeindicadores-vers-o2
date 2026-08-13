import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { computeRncResult } from "@/features/rnc/calculations";
import { toRncPublishedPayload } from "@/features/rnc/publications";
import { loadRncConfiguration } from "@/features/rnc/services";
import type { RncNormalizedRecord } from "@/features/rnc/types";
import { periodFromOptionalFields } from "@/lib/period";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { toJsonValue } from "@/server/database/json";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

const MODULE = "rnc";
const INDICATOR = "dias_tratativa";

const publishSchema = z.object({
  metaDias: z.number().min(0).max(100000).default(15),
  periodStartYear: z.number().int().min(2000).max(2200).optional(),
  periodStartMonth: z.number().int().min(1).max(12).optional(),
  periodEndYear: z.number().int().min(2000).max(2200).optional(),
  periodEndMonth: z.number().int().min(1).max(12).optional(),
});

function isMissingPublicationTable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

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
  return { ...publication, publishedAt: publication.publishedAt.toISOString() };
}

/** GET /api/publicacoes/rnc — último snapshot publicado. */
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

/** POST /api/publicacoes/rnc — recalcula do Neon e cria versão imutável. */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:publish");
    const input = publishSchema.parse(await req.json());

    const rows = await prisma.rncRecord.findMany({
      orderBy: [{ dataCriacao: "asc" }, { unidade: "asc" }],
    });
    if (!rows.length) {
      return NextResponse.json(
        { error: "Não há registros de RNC para publicar." },
        { status: 400 },
      );
    }

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
    const configuration = await prisma.$transaction((tx) => loadRncConfiguration(tx));
    const period = periodFromOptionalFields(input);
    const result = computeRncResult(records, input.metaDias, configuration.excludedUnits, period);
    if (result.resultadoDias === null) {
      return NextResponse.json(
        {
          error: "Não há RNC solucionada com Tempo de Tratativa numérico para publicar.",
        },
        { status: 400 },
      );
    }

    const payload = toRncPublishedPayload(result);
    const status = payload.resultado <= payload.meta ? "OK" : "FORA";

    const publication = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
          target: payload.meta,
          result: payload.resultado,
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
        target: payload.meta,
        result: payload.resultado,
        status,
      },
      metadata: {
        totalCriadas: payload.semestreTotal,
        totalTratadas: payload.semestreResolvidas,
        unidades: payload.unidades.length,
        meses: payload.mensal.length,
      },
    });

    return NextResponse.json({ publication: serializePublication(publication) });
  } catch (error) {
    if (isMissingPublicationTable(error)) {
      return NextResponse.json(
        {
          error: "A tabela de publicações ainda não foi criada. Execute pnpm db:upgrade:rdo.",
        },
        { status: 503 },
      );
    }
    return handleApiError(error);
  }
}

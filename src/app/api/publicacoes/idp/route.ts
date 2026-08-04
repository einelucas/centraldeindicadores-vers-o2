import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { computeIdpDetailedResult } from "@/features/idp/calculations";
import {
  filterIdpExcludedDisciplines,
  loadIdpExcludedDisciplines,
} from "@/features/idp/configuration";
import { toIdpPublishedPayload } from "@/features/idp/publications";
import {
  IDP_DEFAULT_MONTH_END,
  IDP_DEFAULT_MONTH_START,
  type IdpNormalizedRecord,
} from "@/features/idp/types";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { toJsonValue } from "@/server/database/json";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";


type LoadedIdpRow = {
  unit: string;
  year: number;
  month: number;
  disciplina: string;
  custoLinhaBase: number;
  custoReal: number;
  raw: unknown;
};

const MODULE = "idp";
const INDICATOR = "aderencia";

const publishSchema = z.object({
  year: z.number().int().min(1900).max(2200),
  monthStart: z.number().int().min(1).max(12).default(IDP_DEFAULT_MONTH_START),
  monthEnd: z.number().int().min(1).max(12).default(IDP_DEFAULT_MONTH_END),
  threshold: z.number().min(0).max(200).default(98),
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
  return {
    ...publication,
    publishedAt: publication.publishedAt.toISOString(),
  };
}

/** GET /api/publicacoes/idp — último snapshot publicado do IDP. */
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

/** POST /api/publicacoes/idp — publica uma versão calculada somente do banco. */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:publish");
    const input = publishSchema.parse(await req.json());
    const monthStart = Math.min(input.monthStart, input.monthEnd);
    const monthEnd = Math.max(input.monthStart, input.monthEnd);
    const thresholdFraction = input.threshold / 100;

    const [rows, excludedDisciplines] = await Promise.all([
      prisma.idpRecord.findMany({
        where: {
          year: input.year,
          month: { gte: monthStart, lte: monthEnd },
        },
        orderBy: [{ unit: "asc" }, { disciplina: "asc" }, { month: "asc" }],
      }),
      loadIdpExcludedDisciplines(prisma),
    ]);

    if (!rows.length) {
      return NextResponse.json(
        { error: "Não há registros de IDP no período selecionado para publicar." },
        { status: 400 },
      );
    }

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

    if (!records.length) {
      return NextResponse.json(
        {
          error:
            "Todos os registros do período pertencem a disciplinas excluídas do IDP.",
        },
        { status: 400 },
      );
    }

    const result = computeIdpDetailedResult(records, {
      year: input.year,
      monthStart,
      monthEnd,
      threshold: thresholdFraction,
    });

    if (result.totalLinhaBase <= 0) {
      return NextResponse.json(
        {
          error:
            "O período selecionado não possui custo de linha de base válido para calcular a aderência.",
        },
        { status: 400 },
      );
    }

    const payload = toIdpPublishedPayload(result, input.threshold);
    const status = payload.resultado >= input.threshold ? "OK" : "ABAIXO";

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
        year: input.year,
        monthStart,
        monthEnd,
        target: input.threshold,
        result: payload.resultado,
        status,
      },
      metadata: {
        totalLinhaBase: payload.totalLinhaBase,
        totalReal: payload.totalReal,
        unidades: payload.unidades.length,
        disciplinasExcluidas: excludedDisciplines,
        registrosDesconsiderados: allRecords.length - records.length,
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

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { computeIdpResult } from "@/features/idp/calculations";
import { loadIdpExcludedDisciplines, loadIdpExcludedUnits } from "@/features/idp/configuration";
import { toIdpPublishedPayload } from "@/features/idp/publications";
import { storedIdpRowToRecord } from "@/features/idp/services";
import { IDP_DEFAULT_TARGET } from "@/features/idp/types";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { toJsonValue } from "@/server/database/json";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

const MODULE = "idp";
const INDICATOR = "aderencia";

const publishSchema = z.object({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
  historyStart: z.number().int().min(1).max(12),
  historyEnd: z.number().int().min(1).max(12),
  threshold: z
    .number()
    .min(0)
    .max(200)
    .default(IDP_DEFAULT_TARGET * 100),
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

export async function GET() {
  try {
    await requirePermission("indicators:read");
    const publication = await prisma.indicatorPublication.findFirst({
      where: { module: MODULE, indicator: INDICATOR, active: true },
      orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
      include: { publishedBy: { select: { id: true, name: true, email: true } } },
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

/** Publica a competência escolhida com a lista exata de RSOs usada no cálculo. */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:publish");
    const input = publishSchema.parse(await req.json());
    const thresholdFraction = input.threshold / 100;
    const historyStart = Math.min(input.historyStart, input.historyEnd);
    const historyEnd = Math.max(input.historyStart, input.historyEnd);

    const [rows, excludedDisciplines, excludedUnits] = await Promise.all([
      prisma.idpRsoRecord.findMany({
        where: { referenceYear: input.year },
        orderBy: [{ referenceMonth: "asc" }, { unit: "asc" }, { rsoNumero: "asc" }],
      }),
      loadIdpExcludedDisciplines(prisma),
      loadIdpExcludedUnits(prisma),
    ]);

    if (!rows.length) {
      return NextResponse.json(
        { error: "Não há RSOs no ano selecionado para publicar." },
        { status: 400 },
      );
    }

    const records = rows.map(storedIdpRowToRecord);
    const result = computeIdpResult(
      records,
      thresholdFraction,
      excludedDisciplines,
      {
        selectedYear: input.year,
        selectedMonth: input.month,
        historyMonthStart: historyStart,
        historyMonthEnd: historyEnd,
      },
      excludedUnits,
    );

    if (!result.activeDocuments) {
      return NextResponse.json(
        { error: "Não há RSO para a competência selecionada." },
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
        include: { publishedBy: { select: { id: true, name: true, email: true } } },
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
        month: input.month,
        target: input.threshold,
        result: payload.resultado,
        status,
      },
      metadata: {
        documentosAtivos: payload.documentosAtivos,
        documentos: payload.unidades.map((unit) => ({
          unidade: unit.n,
          rso: unit.rsoNumero,
          arquivo: unit.fileName,
        })),
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

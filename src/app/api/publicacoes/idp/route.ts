import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { computeIdpResult } from "@/features/idp/calculations";
import { loadIdpExcludedDisciplines } from "@/features/idp/configuration";
import { toIdpPublishedPayload } from "@/features/idp/publications";
import { storedIdpRowToRecord } from "@/features/idp/services";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { toJsonValue } from "@/server/database/json";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

const MODULE = "idp";
const INDICATOR = "aderencia";

const publishSchema = z.object({
  threshold: z.number().min(0).max(200).default(98),
  selectedYear: z.number().int().min(2000).max(2100),
  monthStart: z.number().int().min(1).max(12),
  monthEnd: z.number().int().min(1).max(12),
});

function isMissingPublicationTable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code);
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

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:publish");
    const input = publishSchema.parse(await req.json());
    const thresholdFraction = input.threshold / 100;

    const [rows, excludedDisciplines] = await Promise.all([
      prisma.idpRsoRecord.findMany({
        orderBy: [{ referenceDate: "desc" }, { unit: "asc" }, { rsoNumero: "desc" }],
      }),
      loadIdpExcludedDisciplines(prisma),
    ]);

    if (!rows.length) {
      return NextResponse.json(
        { error: "Não há documentos RSO importados para publicar." },
        { status: 400 },
      );
    }

    const result = computeIdpResult(
      rows.map(storedIdpRowToRecord),
      thresholdFraction,
      excludedDisciplines,
      {
        selectedYear: input.selectedYear,
        monthStart: input.monthStart,
        monthEnd: input.monthEnd,
      },
    );

    if (!result.unitRows.some((unit) => unit.nFases > 0)) {
      return NextResponse.json(
        { error: "Os RSOs ativos não possuem fases de execução reconhecidas." },
        { status: 400 },
      );
    }

    const publicationDate = new Date();
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
          publishedAt: publicationDate,
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
        source: "RSO",
        target: input.threshold,
        result: payload.resultado,
        status,
      },
      metadata: {
        documentosAtivos: payload.documentosAtivos,
        unidades: payload.unidades.length,
        disciplinas: payload.disciplinas?.length ?? 0,
        disciplinasExcluidas: excludedDisciplines,
        periodo: {
          ano: payload.selectedYear,
          mesInicial: payload.monthStart,
          mesFinal: payload.monthEnd,
        },
      },
    });

    return NextResponse.json({ publication: serializePublication(publication) });
  } catch (error) {
    if (isMissingPublicationTable(error)) {
      return NextResponse.json(
        {
          error:
            "As tabelas do IDP/RSO ou de publicações ainda não foram criadas. Execute os upgrades do banco.",
        },
        { status: 503 },
      );
    }
    return handleApiError(error);
  }
}

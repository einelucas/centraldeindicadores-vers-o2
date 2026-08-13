import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { toAccidentRatePublishedPayload } from "@/features/taxa-acidentes/publications";
import {
  loadAccidentRateData,
  saveAccidentIndicatorResult,
} from "@/features/taxa-acidentes/services";
import { periodFromOptionalFields } from "@/lib/period";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { toJsonValue } from "@/server/database/json";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

const MODULE = "taxa-acidentes";
const INDICATOR = "taxa";

const publishSchema = z.object({
  periodStartYear: z.number().int().min(2000).max(2200).optional(),
  periodStartMonth: z.number().int().min(1).max(12).optional(),
  periodEndYear: z.number().int().min(2000).max(2200).optional(),
  periodEndMonth: z.number().int().min(1).max(12).optional(),
});

function missingTables(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
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
      include: {
        publishedBy: { select: { id: true, name: true, email: true } },
      },
    });
    return NextResponse.json({
      publication: publication ? serializePublication(publication) : null,
    });
  } catch (error) {
    if (missingTables(error)) {
      return NextResponse.json({ publication: null, setupRequired: true });
    }
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:publish");
    const rawBody = await req.text();
    const input = publishSchema.parse(rawBody ? JSON.parse(rawBody) : {});
    const period = periodFromOptionalFields(input);
    const loaded = await prisma.$transaction((tx) => loadAccidentRateData(tx, period));
    if (!loaded.monthly.length || loaded.result.result === null) {
      return NextResponse.json(
        { error: "Adicione pelo menos um mês antes de publicar." },
        { status: 400 },
      );
    }

    const payload = toAccidentRatePublishedPayload(loaded.result);
    const status = payload.resultado <= payload.meta ? "OK" : "ACIMA";

    const publication = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await saveAccidentIndicatorResult(tx, loaded.result);
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
        referenceYear: payload.referenceYear,
        referenceMonth: payload.referenceMonth,
        months: payload.mensal.length,
        units: payload.unidades.length,
        acidentesCaf: payload.acidentesCaf,
        acidentesCafPorUnidade: payload.acidentesCafPorUnidade,
        acidentesSaf: payload.acidentesSaf,
      },
    });

    return NextResponse.json({ publication: serializePublication(publication) });
  } catch (error) {
    if (missingTables(error)) {
      return NextResponse.json(
        {
          error: "Execute pnpm db:upgrade:rdo e pnpm db:upgrade:accidents antes de publicar.",
        },
        { status: 503 },
      );
    }
    return handleApiError(error);
  }
}

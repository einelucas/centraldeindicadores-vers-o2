import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { computeFiveSResult } from "@/features/cinco-s/calculations";
import { toFiveSPublishedPayload } from "@/features/cinco-s/publications";
import {
  FIVES_EXCLUDED_SETTING,
  FIVES_TARGET_SETTING,
  normalizeExcludedUnits,
  recalcFiveSIndicators,
} from "@/features/cinco-s/services";
import type { FiveSArea, FiveSNormalizedRecord } from "@/features/cinco-s/types";
import { parsePeriodRangeParams, periodFromOptionalFields } from "@/lib/period";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { toJsonValue } from "@/server/database/json";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";
import { selectPublicationForPeriod } from "@/server/publications/period-selection";
import { resolvePublicationCycle } from "@/server/publications/cycle";

const MODULE = "cinco-s";
const INDICATOR = "aderencia";

const publishSchema = z.object({
  target: z.number().min(0).max(100).default(95),
  excludedUnits: z.array(z.string().max(100)).max(100).default(["SP", "CSC"]),
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

/** GET /api/publicacoes/cinco-s — último snapshot publicado. */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:read");
    const requestedPeriod = parsePeriodRangeParams(req.nextUrl.searchParams);
    const publications = await prisma.indicatorPublication.findMany({
      where: { module: MODULE, indicator: INDICATOR },
      orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
      include: {
        publishedBy: { select: { id: true, name: true, email: true } },
      },
    });
    const { publication, historyCount } = selectPublicationForPeriod(
      MODULE,
      publications,
      requestedPeriod,
    );
    return NextResponse.json({
      publication: publication ? serializePublication(publication) : null,
      historyCount,
    });
  } catch (error) {
    if (isMissingPublicationTable(error)) {
      return NextResponse.json({ publication: null, historyCount: 0, setupRequired: true });
    }
    return handleApiError(error);
  }
}

/** POST /api/publicacoes/cinco-s — recalcula do Neon e cria versão imutável. */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:publish");
    const input = publishSchema.parse(await req.json());
    const excludedUnits = normalizeExcludedUnits(input.excludedUnits);
    const threshold = input.target / 100;

    const rows = await prisma.fiveSRecord.findMany({
      orderBy: [{ year: "asc" }, { month: "asc" }, { unit: "asc" }],
    });
    if (!rows.length) {
      return NextResponse.json({ error: "Não há registros de 5S para publicar." }, { status: 400 });
    }

    const records: FiveSNormalizedRecord[] = rows.map((row) => {
      const raw = (row.raw as Record<string, unknown>) ?? {};
      return {
        unit: row.unit,
        year: row.year,
        month: row.month,
        areas: (raw.areas as FiveSArea[] | undefined) ?? [],
        raw,
      };
    });
    const period = periodFromOptionalFields(input);
    const cycle = resolvePublicationCycle(period);
    const result = computeFiveSResult(records, excludedUnits, threshold, period);
    if (result.geral === null) {
      return NextResponse.json(
        {
          error:
            "O último mês não possui unidades elegíveis. Revise a lista de exclusão ou importe um período válido.",
        },
        { status: 400 },
      );
    }

    const payload = toFiveSPublishedPayload(result);
    const status = payload.resultado >= payload.meta ? "OK" : "FORA";

    const publication = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.appSetting.upsert({
        where: { key: FIVES_TARGET_SETTING },
        create: { key: FIVES_TARGET_SETTING, value: toJsonValue(threshold) },
        update: { value: toJsonValue(threshold) },
      });
      await tx.appSetting.upsert({
        where: { key: FIVES_EXCLUDED_SETTING },
        create: {
          key: FIVES_EXCLUDED_SETTING,
          value: toJsonValue(excludedUnits),
        },
        update: { value: toJsonValue(excludedUnits) },
      });
      await recalcFiveSIndicators(tx);

      const latest = await tx.indicatorPublication.findFirst({
        where: { module: MODULE, indicator: INDICATOR },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;

      await tx.indicatorPublication.updateMany({
        where: cycle
          ? {
              module: MODULE,
              indicator: INDICATOR,
              active: true,
              cycleYear: cycle.year,
              cycleSemester: cycle.semester,
            }
          : { module: MODULE, indicator: INDICATOR, active: true },
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
          cycleYear: cycle?.year ?? null,
          cycleSemester: cycle?.semester ?? null,
          periodStartYear: period?.startYear ?? null,
          periodStartMonth: period?.startMonth ?? null,
          periodEndYear: period?.endYear ?? null,
          periodEndMonth: period?.endMonth ?? null,
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
        units: payload.unidades.length,
        months: payload.mensal.length,
        excludedUnits,
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

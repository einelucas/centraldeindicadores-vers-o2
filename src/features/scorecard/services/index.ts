/** Serviço de consolidação do Scorecard 2026. */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import { makeBusinessKey, makeContentHash } from "@/lib/hashing";
import { computeScorecard } from "@/features/scorecard/calculations";
import { publishedValueForPeriod } from "@/features/scorecard/publications";
import { SC_INDICATORS } from "@/features/scorecard/types";

/** Lê os valores publicados dos cinco indicadores para um período. */
export async function pullScorecardValues(
  tx: Prisma.TransactionClient,
  year: number,
  month: number,
): Promise<Record<string, number | null>> {
  const values: Record<string, number | null> = {};

  for (const indicator of SC_INDICATORS) {
    if (!indicator.source) {
      values[indicator.key] = null;
      continue;
    }

    const publication = await tx.indicatorPublication.findFirst({
      where: {
        module: indicator.source.module,
        indicator: indicator.source.indicator,
        active: true,
      },
      orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
      include: {
        publishedBy: { select: { id: true, name: true, email: true } },
      },
    });

    values[indicator.key] = publication
      ? publishedValueForPeriod(indicator.key, publication, year, month)
      : null;
  }

  return values;
}

export interface ScorecardComputation {
  year: number;
  month: number;
  values: Record<string, number | null>;
  result: ReturnType<typeof computeScorecard>;
}

/** Consolida o período, aplicando ajustes manuais sobre os valores publicados. */
export async function computeScorecardForPeriod(
  tx: Prisma.TransactionClient,
  year: number,
  month: number,
  overrides: Record<string, number | null> = {},
): Promise<ScorecardComputation> {
  const pulled = await pullScorecardValues(tx, year, month);
  const values: Record<string, number | null> = { ...pulled };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== null && value !== undefined && Number.isFinite(value)) {
      values[key] = value;
    }
  }
  const result = computeScorecard(values);
  return { year, month, values, result };
}

/** Salva um snapshot do scorecard, idempotente por ano e mês. */
export async function saveScorecardSnapshot(
  tx: Prisma.TransactionClient,
  year: number,
  month: number,
  values: Record<string, number | null>,
  userId: string,
): Promise<void> {
  const businessKey = makeBusinessKey("SCORECARD", [String(year), String(month)]);
  const contentHash = makeContentHash({ values });

  const existing = await tx.scorecardSnapshot.findUnique({
    where: { businessKey },
    select: { contentHash: true },
  });

  if (!existing) {
    await tx.scorecardSnapshot.create({
      data: {
        businessKey,
        contentHash,
        year,
        month,
        raw: toJsonValue({ values }),
        firstImportId: userId,
        lastImportId: userId,
      },
    });
  } else if (existing.contentHash !== contentHash) {
    await tx.scorecardSnapshot.update({
      where: { businessKey },
      data: {
        contentHash,
        raw: toJsonValue({ values }),
        lastImportId: userId,
        lastSeenAt: new Date(),
      },
    });
  }
}

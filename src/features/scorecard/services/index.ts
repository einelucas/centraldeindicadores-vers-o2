/** Serviço de consolidação do Scorecard 2026. */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import { makeBusinessKey, makeContentHash } from "@/lib/hashing";
import { normalizePeriodRange, type PeriodRange } from "@/lib/period";
import { computeScorecard } from "@/features/scorecard/calculations";
import {
  latestPublishedValueForPeriod,
  type GeneralPanelPublicationInput,
} from "@/features/scorecard/publications";
import { SC_INDICATORS } from "@/features/scorecard/types";

/**
 * Período de controle único do Scorecard: escolhido na Administração,
 * persistido no banco e usado tanto para os dados do painel administrativo
 * quanto para o que é puxado das abas no Painel Geral. Só o botão "Ciclo
 * atual" volta a apontar para o semestre vigente na data real — fora isso, a
 * escolha do usuário permanece entre sessões e recarregamentos.
 */
export const SCORECARD_PANEL_PERIOD_SETTING = "scorecard.panelPeriod";

interface AppSettingReader {
  appSetting: {
    findUnique(args: {
      where: { key: string };
      select: { value: true };
    }): Promise<{ value: Prisma.JsonValue } | null>;
  };
}

interface AppSettingWriter {
  appSetting: {
    upsert(args: {
      where: { key: string };
      create: { key: string; value: Prisma.InputJsonValue | typeof Prisma.JsonNull };
      update: { value: Prisma.InputJsonValue | typeof Prisma.JsonNull };
    }): Promise<unknown>;
  };
}

function parseScorecardPanelPeriod(value: Prisma.JsonValue | undefined): PeriodRange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { startYear, startMonth, endYear, endMonth } = record;
  if (
    !Number.isInteger(startYear) ||
    !Number.isInteger(startMonth) ||
    !Number.isInteger(endYear) ||
    !Number.isInteger(endMonth)
  ) {
    return null;
  }
  return normalizePeriodRange({
    startYear: startYear as number,
    startMonth: startMonth as number,
    endYear: endYear as number,
    endMonth: endMonth as number,
  });
}

/** Lê o período persistido do Painel Geral; `null` se nunca foi salvo. */
export async function loadScorecardPanelPeriod(db: AppSettingReader): Promise<PeriodRange | null> {
  const setting = await db.appSetting.findUnique({
    where: { key: SCORECARD_PANEL_PERIOD_SETTING },
    select: { value: true },
  });
  return setting ? parseScorecardPanelPeriod(setting.value) : null;
}

/** Salva o período de controle único do Scorecard (Administração + Painel Geral). */
export async function saveScorecardPanelPeriod(
  db: AppSettingWriter,
  period: PeriodRange,
): Promise<PeriodRange> {
  const normalized = normalizePeriodRange(period);
  await db.appSetting.upsert({
    where: { key: SCORECARD_PANEL_PERIOD_SETTING },
    create: { key: SCORECARD_PANEL_PERIOD_SETTING, value: toJsonValue(normalized) },
    update: { value: toJsonValue(normalized) },
  });
  return normalized;
}

/** Lê os valores publicados dos cinco indicadores para um período. */
export async function pullScorecardValues(
  tx: Prisma.TransactionClient,
  year: number,
  month: number,
): Promise<Record<string, number | null>> {
  const values: Record<string, number | null> = {};
  const sources = SC_INDICATORS.flatMap((indicator) =>
    indicator.source ? [indicator.source] : [],
  );

  const publications: GeneralPanelPublicationInput[] = sources.length
    ? await tx.indicatorPublication.findMany({
        where: {
          OR: sources.map((source) => ({
            module: source.module,
            indicator: source.indicator,
          })),
        },
        orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
        include: {
          publishedBy: { select: { id: true, name: true, email: true } },
        },
      })
    : [];

  for (const indicator of SC_INDICATORS) {
    if (!indicator.source) {
      values[indicator.key] = null;
      continue;
    }

    const matchingPublications = publications.filter(
      (publication) =>
        publication.module === indicator.source?.module &&
        publication.indicator === indicator.source?.indicator,
    );

    values[indicator.key] = latestPublishedValueForPeriod(
      indicator.key,
      matchingPublications,
      year,
      month,
    );
  }

  return values;
}

export interface ScorecardComputation {
  year: number;
  month: number;
  /** Valores vindos exclusivamente das publicações dos módulos. */
  sourceValues: Record<string, number | null>;
  /** Valores efetivos após aplicação de ajustes manuais. */
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
  const sourceValues = await pullScorecardValues(tx, year, month);
  const values: Record<string, number | null> = { ...sourceValues };

  for (const [key, value] of Object.entries(overrides)) {
    if (value !== null && value !== undefined && Number.isFinite(value)) {
      values[key] = value;
    }
  }

  const result = computeScorecard(values);
  return { year, month, sourceValues, values, result };
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

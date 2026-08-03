import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import {
  buildGeneralPanelData,
  monthKeyToLabel,
  type GeneralPanelData,
  type GeneralPanelIndicator,
} from "@/features/scorecard/publications";
import {
  SCORECARD_MAX_POINTS,
  SCORECARD_MONTHLY_POOL,
  SCORECARD_PERIOD_MONTHS,
} from "@/features/scorecard/types";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

const SCORECARD_YEAR = 2026;

type PanelTargetIndicator = Pick<
  GeneralPanelIndicator,
  "key" | "direction" | "meta"
>;

function passesSpreadsheetTarget(
  indicator: PanelTargetIndicator,
  value: number | null,
): boolean | null {
  if (value === null || !Number.isFinite(value)) return null;

  return indicator.direction === "lower"
    ? value <= indicator.meta
    : value >= indicator.meta;
}

function percentOfSpreadsheetTarget(
  indicator: PanelTargetIndicator,
  value: number | null,
): number | null {
  if (value === null || !Number.isFinite(value)) return null;

  if (indicator.direction === "lower") {
    return value > 0 ? (indicator.meta / value) * 100 : 100;
  }

  return indicator.meta ? (value / indicator.meta) * 100 : null;
}

/**
 * Reaplica ao Painel Geral a mesma janela e a mesma pontuação da planilha:
 * Jun–Nov/2026, total máximo fixo de 11.582 pontos e regra tudo-ou-nada.
 */
function applySpreadsheetScore(data: GeneralPanelData): GeneralPanelData {
  const allowedMonths = new Set<number>(SCORECARD_PERIOD_MONTHS);
  const monthKeys = data.monthKeys.filter((key) => {
    const [yearText, monthText] = key.split("-");
    return (
      Number(yearText) === SCORECARD_YEAR &&
      allowedMonths.has(Number(monthText))
    );
  });

  const indicators = data.indicators.map((indicator) => {
    const originalByKey = new Map(
      indicator.months.map((cell) => [cell.key, cell]),
    );

    const months = monthKeys.map((key) => {
      const original = originalByKey.get(key);
      const value = original?.value ?? null;

      return {
        key,
        label: monthKeyToLabel(key),
        value,
        pass: passesSpreadsheetTarget(indicator, value),
        pctOfMeta: percentOfSpreadsheetTarget(indicator, value),
      };
    });

    const values = months
      .map((month) => month.value)
      .filter((value): value is number => value !== null);

    const partial = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;

    return {
      ...indicator,
      months,
      hasData: values.length > 0,
      pass: passesSpreadsheetTarget(indicator, indicator.result),
      partial,
      partialPass: passesSpreadsheetTarget(indicator, partial),
    };
  });

  const pontosRealizados = indicators.reduce(
    (total, indicator) =>
      total +
      indicator.months.reduce(
        (subtotal, month) =>
          subtotal +
          (month.pass ? (indicator.peso / 100) * SCORECARD_MONTHLY_POOL : 0),
        0,
      ),
    0,
  );

  return {
    ...data,
    hasData: indicators.some((indicator) => indicator.hasData),
    monthKeys,
    monthLabels: monthKeys.map(monthKeyToLabel),
    pontuacaoPrevista: SCORECARD_MAX_POINTS,
    pontosRealizados,
    atendimentoGeral: (pontosRealizados / SCORECARD_MAX_POINTS) * 100,
    indicators,
  };
}

function isMissingPublicationTable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2021"
  );
}

/** GET /api/dashboard — Painel Geral 2026 baseado em snapshots publicados. */
export async function GET() {
  try {
    await requirePermission("indicators:read");

    const publications = await prisma.indicatorPublication.findMany({
      where: { active: true },
      orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
      include: {
        publishedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(
      applySpreadsheetScore(buildGeneralPanelData(publications)),
    );
  } catch (error) {
    if (isMissingPublicationTable(error)) {
      return NextResponse.json({
        ...applySpreadsheetScore(buildGeneralPanelData([])),
        setupRequired: true,
      });
    }

    return handleApiError(error);
  }
}

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import {
  buildGeneralPanelData,
  monthKeyToLabel,
  type GeneralPanelData,
  type GeneralPanelIndicator,
} from "@/features/scorecard/publications";
import { loadScorecardPanelPeriod } from "@/features/scorecard/services";
import { SCORECARD_MAX_POINTS, SCORECARD_MONTHLY_POOL } from "@/features/scorecard/types";
import { enumeratePeriodMonths, getCurrentCycle, type PeriodRange } from "@/lib/period";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

type PanelTargetIndicator = Pick<GeneralPanelIndicator, "key" | "direction" | "meta">;

function passesSpreadsheetTarget(
  indicator: PanelTargetIndicator,
  value: number | null,
): boolean | null {
  if (value === null || !Number.isFinite(value)) return null;

  return indicator.direction === "lower" ? value <= indicator.meta : value >= indicator.meta;
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
 * Reaplica ao Painel Geral a mesma pontuação da planilha (total máximo fixo
 * de 11.582 pontos, regra tudo-ou-nada) usando a janela de meses do período
 * salvo na Administração do Scorecard — o mesmo período que controla o que é
 * puxado das abas. Sem período salvo ainda (instalação nova), cai no ciclo
 * semestral vigente na data real.
 */
function applySpreadsheetScore(data: GeneralPanelData, period: PeriodRange): GeneralPanelData {
  const allowedKeys = new Set(
    enumeratePeriodMonths(period).map(
      ({ year, month }) => `${year}-${String(month).padStart(2, "0")}`,
    ),
  );
  const monthKeys = data.monthKeys.filter((key) => allowedKeys.has(key));

  const indicators = data.indicators.map((indicator) => {
    const originalByKey = new Map(indicator.months.map((cell) => [cell.key, cell]));

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
          subtotal + (month.pass ? (indicator.peso / 100) * SCORECARD_MONTHLY_POOL : 0),
        0,
      ),
    0,
  );

  // Meta proporcional: só os meses do semestre selecionado que têm dados reais
  // entram no denominador. Os 11.582 pontos continuam expostos à parte, em
  // `pontuacaoPrevistaSemestre`, como referência fixa do ciclo completo.
  const pontuacaoPrevista = monthKeys.length * SCORECARD_MONTHLY_POOL;

  return {
    ...data,
    hasData: indicators.some((indicator) => indicator.hasData),
    monthKeys,
    monthLabels: monthKeys.map(monthKeyToLabel),
    pontuacaoPrevista,
    pontuacaoPrevistaSemestre: SCORECARD_MAX_POINTS,
    pontosRealizados,
    atendimentoGeral: pontuacaoPrevista > 0 ? (pontosRealizados / pontuacaoPrevista) * 100 : 0,
    indicators,
  };
}

function isMissingPublicationTable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

/** GET /api/dashboard — Painel Geral 2026 baseado em snapshots publicados. */
export async function GET() {
  try {
    await requirePermission("indicators:read");

    const [publications, savedPeriod] = await Promise.all([
      // Histórico completo (não só a versão ativa): uma republicação pode
      // cobrir só parte do ciclo, e buildGeneralPanelData precisa das versões
      // antigas para não perder meses que a mais nova não inclui.
      prisma.indicatorPublication.findMany({
        orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
        include: {
          publishedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      loadScorecardPanelPeriod(prisma),
    ]);
    const period = savedPeriod ?? getCurrentCycle();

    return NextResponse.json(applySpreadsheetScore(buildGeneralPanelData(publications), period));
  } catch (error) {
    if (isMissingPublicationTable(error)) {
      return NextResponse.json({
        ...applySpreadsheetScore(buildGeneralPanelData([]), getCurrentCycle()),
        setupRequired: true,
      });
    }

    return handleApiError(error);
  }
}

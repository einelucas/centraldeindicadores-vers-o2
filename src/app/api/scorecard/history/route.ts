import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { computeScorecard } from "@/features/scorecard/calculations";
import { SC_INDICATORS } from "@/features/scorecard/types";
import { enumeratePeriodMonths, getCurrentCycle, parsePeriodRangeParams } from "@/lib/period";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

function readSnapshotValues(raw: Prisma.JsonValue): Record<string, number | null> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const values = (raw as Prisma.JsonObject).values;
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};

  const record = values as Prisma.JsonObject;
  const output: Record<string, number | null> = {};

  for (const indicator of SC_INDICATORS) {
    const value = record[indicator.key];
    output[indicator.key] = typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  return output;
}

/**
 * GET /api/scorecard/history — snapshots salvos do intervalo informado
 * (periodStartYear/periodStartMonth/periodEndYear/periodEndMonth). Sem
 * intervalo informado, usa o ciclo semestral vigente. Constrói um `OR` de
 * pares exatos {year, month} em vez de um único `year`, para representar
 * corretamente um ciclo que atravessa a virada (ex.: dez/2026 a mai/2027).
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:read");

    const { searchParams } = new URL(req.url);
    const range = parsePeriodRangeParams(searchParams) ?? getCurrentCycle();
    const months = enumeratePeriodMonths(range);

    const snapshots = await prisma.scorecardSnapshot.findMany({
      where: {
        OR: months.map(({ year, month }) => ({ year, month })),
      },
      orderBy: [{ year: "asc" }, { month: "asc" }],
      select: {
        year: true,
        month: true,
        raw: true,
      },
    });

    type SnapshotRecord = { year: number; month: number; raw: Prisma.JsonValue };

    return NextResponse.json({
      snapshots: snapshots.map((snapshot: SnapshotRecord) => {
        const values = readSnapshotValues(snapshot.raw);
        return {
          year: snapshot.year,
          month: snapshot.month,
          values,
          result: computeScorecard(values),
        };
      }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/scorecard/history — limpa somente os snapshots do ciclo informado. */
export async function DELETE(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:edit");
    const range = parsePeriodRangeParams(req.nextUrl.searchParams);
    if (!range) {
      return NextResponse.json(
        { error: "Informe o início e o fim do ciclo que será limpo." },
        { status: 400 },
      );
    }

    const months = enumeratePeriodMonths(range);
    if (months.length > 24) {
      return NextResponse.json(
        { error: "O intervalo para limpeza deve ter no máximo 24 meses." },
        { status: 400 },
      );
    }

    const where = { OR: months.map(({ year, month }) => ({ year, month })) };
    const existing = await prisma.scorecardSnapshot.findMany({
      where,
      select: { id: true, year: true, month: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    if (!existing.length) return NextResponse.json({ ok: true, deleted: 0 });

    const deleted = await prisma.scorecardSnapshot.deleteMany({ where });
    await recordAudit({
      userId: user.id,
      action: "RECORDS_CLEARED",
      entity: "ScorecardSnapshot",
      entityId: `${range.startYear}-${range.startMonth}_${range.endYear}-${range.endMonth}`,
      previousData: {
        quantidade: existing.length,
        competencias: existing.map(({ year, month }) => ({ year, month })),
      },
      metadata: {
        module: "scorecard",
        escopo: "ciclo",
        startYear: range.startYear,
        startMonth: range.startMonth,
        endYear: range.endYear,
        endMonth: range.endMonth,
      },
    });

    return NextResponse.json({ ok: true, deleted: deleted.count });
  } catch (error) {
    return handleApiError(error);
  }
}

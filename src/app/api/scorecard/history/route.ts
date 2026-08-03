import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { computeScorecard } from "@/features/scorecard/calculations";
import {
  SC_INDICATORS,
  SCORECARD_PERIOD_MONTHS,
} from "@/features/scorecard/types";
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
    output[indicator.key] =
      typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  return output;
}

/** GET /api/scorecard/history?year=2026 — snapshots salvos do ciclo Jun–Nov. */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:read");

    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year") ?? 2026);

    const snapshots = await prisma.scorecardSnapshot.findMany({
      where: {
        year,
        month: { in: [...SCORECARD_PERIOD_MONTHS] },
      },
      orderBy: { month: "asc" },
      select: {
        year: true,
        month: true,
        raw: true,
      },
    });

    type SnapshotRecord = { year: number; month: number; raw: Prisma.JsonValue };

    return NextResponse.json({
      year,
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

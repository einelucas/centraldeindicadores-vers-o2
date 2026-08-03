import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";
import { recordAudit } from "@/server/audit";
import {
  computeScorecardForPeriod,
  saveScorecardSnapshot,
} from "@/features/scorecard/services";

/** GET /api/scorecard?year=YYYY&month=M — consolida o scorecard do período. */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:read");
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Number(searchParams.get("year") ?? now.getFullYear());
    const month = Number(searchParams.get("month") ?? now.getMonth() + 1);

    // Leitura pura: não precisa de transação (evita timeout em banco remoto).
    const computation = await computeScorecardForPeriod(prisma, year, month);
    return NextResponse.json(computation);
  } catch (err) {
    return handleApiError(err);
  }
}

const saveSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  overrides: z.record(z.number().nullable()).default({}),
});

/** POST /api/scorecard — salva um snapshot (com overrides manuais). */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:export");
    const body = await req.json();
    const { year, month, overrides } = saveSchema.parse(body);

    const computation = await prisma.$transaction(async (tx) => {
      const comp = await computeScorecardForPeriod(tx, year, month, overrides);
      await saveScorecardSnapshot(tx, year, month, comp.values, user.id);
      return comp;
    }, { maxWait: 15000, timeout: 60000 });

    await recordAudit({
      userId: user.id,
      action: "scorecard.save",
      entity: "ScorecardSnapshot",
      entityId: `${year}-${month}`,
      newData: { totalPontos: computation.result.totalPontos },
    });

    return NextResponse.json(computation);
  } catch (err) {
    return handleApiError(err);
  }
}

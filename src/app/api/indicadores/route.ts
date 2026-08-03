import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

const ACTIVE_INDICATOR_MODULES = [
  "rdo",
  "idp",
  "rnc",
  "cinco-s",
  "taxa-acidentes",
  "scorecard",
] as const;

export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:read");
    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year");
    const results = await prisma.indicatorResult.findMany({
      where: {
        module: { in: [...ACTIVE_INDICATOR_MODULES] },
        ...(year ? { year: Number(year) } : {}),
      },
      orderBy: [{ module: "asc" }, { year: "desc" }, { month: "desc" }],
      take: 1000,
    });
    return NextResponse.json({ items: results });
  } catch (err) {
    return handleApiError(err);
  }
}

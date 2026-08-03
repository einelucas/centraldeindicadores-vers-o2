import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";
import { migratedModules } from "@/server/modules/registry";

/** Lista importações com paginação. */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("import:read");
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Number(searchParams.get("pageSize") ?? 20));

    const activeModules = migratedModules();

    const [items, total] = await Promise.all([
      prisma.importJob.findMany({
        where: { module: { in: activeModules } },
        orderBy: { startedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, module: true, fileName: true, status: true,
          totalFound: true, totalInserted: true, totalIgnored: true,
          totalUpdated: true, totalRejected: true, startedAt: true,
          completedAt: true,
        },
      }),
      prisma.importJob.count({ where: { module: { in: activeModules } } }),
    ]);

    return NextResponse.json({ items, total, page, pageSize });
  } catch (err) {
    return handleApiError(err);
  }
}

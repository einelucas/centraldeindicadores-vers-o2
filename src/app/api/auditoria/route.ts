import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

/** GET /api/auditoria — lista o log de auditoria, paginado (somente admin). */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("audit:read");
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(searchParams.get("pageSize") ?? "50")),
    );
    const entity = searchParams.get("entity") ?? undefined;
    const action = searchParams.get("action") ?? undefined;

    const where = {
      ...(entity ? { entity } : {}),
      ...(action ? { action } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { name: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("import:read");
    const { id } = await params;
    const errors = await prisma.importError.findMany({
      where: { importJobId: id },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return NextResponse.json({ items: errors });
  } catch (err) {
    return handleApiError(err);
  }
}

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
    const job = await prisma.importJob.findUnique({
      where: { id },
      include: { batches: { orderBy: { batchNumber: "asc" } } },
    });
    if (!job) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
    return NextResponse.json(job);
  } catch (err) {
    return handleApiError(err);
  }
}

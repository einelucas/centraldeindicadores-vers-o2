import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/session";
import { finalizeImportJob } from "@/server/services/import-service";
import { getModuleDefinition } from "@/server/modules/registry";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("import:run");
    const { id: importJobId } = await params;
    const job = await prisma.importJob.findUnique({ where: { id: importJobId } });
    if (!job) {
      return NextResponse.json(
        { error: "Importação não encontrada" },
        { status: 404 },
      );
    }

    const def = getModuleDefinition(job.module);
    const finalized = await finalizeImportJob({
      importJobId,
      userId: user.id,
      recalcIndicators: def?.recalcIndicators,
    });
    return NextResponse.json({
      status: finalized.status,
      totals: {
        found: finalized.totalFound,
        inserted: finalized.totalInserted,
        ignored: finalized.totalIgnored,
        updated: finalized.totalUpdated,
        rejected: finalized.totalRejected,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { startImportJob } from "@/server/services/import-service";
import { handleApiError } from "@/server/http";
import { getModuleDefinition } from "@/server/modules/registry";

const bodySchema = z.object({
  module: z.string().min(1),
  fileName: z.string().min(1),
  referenceYear: z.number().int().optional(),
  referenceMonth: z.number().int().min(1).max(12).optional(),
  totalFound: z.number().int().min(0),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("import:run");
    const body = bodySchema.parse(await req.json());
    if (!getModuleDefinition(body.module)) {
      return NextResponse.json(
        { error: `Módulo '${body.module}' não está ativo para importação.` },
        { status: 400 },
      );
    }
    const job = await startImportJob({ ...body, userId: user.id });
    return NextResponse.json({ importJobId: job.id, status: job.status });
  } catch (err) {
    return handleApiError(err);
  }
}

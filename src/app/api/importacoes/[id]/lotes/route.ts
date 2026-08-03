import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/session";
import { processBatch } from "@/server/services/import-service";
import { getModuleDefinition } from "@/server/modules/registry";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

/**
 * Recebe um lote de registros JSON já normalizados no navegador.
 * Revalida com Zod, gera chaves no servidor e faz upsert incremental.
 * Idempotente por (importJobId, batchNumber).
 *
 * O roteamento por módulo é resolvido pelo registro central
 * (src/server/modules/registry.ts): módulos não registrados retornam 501.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("import:run");
    const { id: importJobId } = await params;

    const job = await prisma.importJob.findUnique({ where: { id: importJobId } });
    if (!job) {
      return NextResponse.json(
        { error: "Importação não encontrada" },
        { status: 404 },
      );
    }

    const def = getModuleDefinition(job.module);
    if (!def) {
      return NextResponse.json(
        {
          error: `Módulo '${job.module}' ainda não migrado. Ver docs/migration-map.md`,
        },
        { status: 501 },
      );
    }

    const raw = await req.json();
    const batch = def.batchSchema.parse(raw);
    const { records, rejected } = def.toIncrementalRecords(batch.records);
    const outcome = await processBatch({
      importJobId,
      batchNumber: batch.batchNumber,
      records,
      delegateFactory: def.delegateFactory,
    });
    return NextResponse.json({
      ...outcome,
      rejected: outcome.rejected + rejected,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

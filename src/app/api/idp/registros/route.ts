import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

/** DELETE /api/idp/registros — limpa RSOs e registros legados administrativos. */
export async function DELETE() {
  try {
    const user = await requirePermission("indicators:edit");
    const [rsoCount, legacyCount] = await Promise.all([
      prisma.idpRsoRecord.count(),
      prisma.idpRecord.count(),
    ]);
    const count = rsoCount + legacyCount;
    if (count === 0) return NextResponse.json({ ok: true, deleted: 0 });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.idpRsoRecord.deleteMany();
      await tx.idpRecord.deleteMany();
      await tx.indicatorResult.deleteMany({ where: { module: "idp" } });
    });

    await recordAudit({
      userId: user.id,
      action: "RECORDS_CLEARED",
      entity: "IdpRsoRecord",
      previousData: { rso: rsoCount, legado: legacyCount, quantidade: count },
      metadata: { module: "idp", escopo: "todos" },
    });

    return NextResponse.json({ ok: true, deleted: count });
  } catch (error) {
    return handleApiError(error);
  }
}

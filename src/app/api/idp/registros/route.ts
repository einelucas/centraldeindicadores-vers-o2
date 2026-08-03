import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

/**
 * DELETE /api/idp/registros — limpa a base administrativa do IDP.
 * A publicação ativa permanece como snapshot histórico imutável.
 */
export async function DELETE() {
  try {
    const user = await requirePermission("indicators:edit");
    const count = await prisma.idpRecord.count();
    if (count === 0) return NextResponse.json({ ok: true, deleted: 0 });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.idpRecord.deleteMany();
      await tx.indicatorResult.deleteMany({ where: { module: "idp" } });
    });

    await recordAudit({
      userId: user.id,
      action: "RECORDS_CLEARED",
      entity: "IdpRecord",
      previousData: { quantidade: count },
      metadata: { module: "idp", escopo: "todos" },
    });

    return NextResponse.json({ ok: true, deleted: count });
  } catch (error) {
    return handleApiError(error);
  }
}

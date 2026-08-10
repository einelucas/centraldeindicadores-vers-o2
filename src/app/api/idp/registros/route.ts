import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

/** Limpa apenas o histórico administrativo de RSOs; publicação permanece. */
export async function DELETE() {
  try {
    const user = await requirePermission("indicators:edit");
    const count = await prisma.idpRsoRecord.count();
    if (count === 0) return NextResponse.json({ ok: true, deleted: 0 });

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.idpRsoRecord.deleteMany();
      await tx.indicatorResult.deleteMany({ where: { module: "idp" } });
    });

    await recordAudit({
      userId: user.id,
      action: "RECORDS_CLEARED",
      entity: "IdpRsoRecord",
      previousData: { quantidade: count },
      metadata: { module: "idp", escopo: "todos_rsos" },
    });

    return NextResponse.json({ ok: true, deleted: count });
  } catch (error) {
    return handleApiError(error);
  }
}

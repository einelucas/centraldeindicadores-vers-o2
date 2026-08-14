import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadScorecardPanelPeriod, saveScorecardPanelPeriod } from "@/features/scorecard/services";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

/**
 * GET /api/scorecard/panel-period — período de controle único do Scorecard
 * (Administração + Painel Geral). `period: null` significa que nunca foi
 * salvo; o chamador cai de volta no ciclo vigente na data real.
 */
export async function GET() {
  try {
    await requirePermission("indicators:read");
    const period = await loadScorecardPanelPeriod(prisma);
    return NextResponse.json({ period });
  } catch (error) {
    return handleApiError(error);
  }
}

const periodSchema = z.object({
  startYear: z.number().int().min(2000).max(2200),
  startMonth: z.number().int().min(1).max(12),
  endYear: z.number().int().min(2000).max(2200),
  endMonth: z.number().int().min(1).max(12),
});

/**
 * PATCH /api/scorecard/panel-period — salva o período escolhido na
 * Administração. Mesma permissão de "Salvar snapshot" (indicators:export):
 * qualquer perfil com acesso à tela de Administração do Scorecard pode ajustar.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requirePermission("indicators:export");
    const body = periodSchema.parse(await req.json());
    const saved = await saveScorecardPanelPeriod(prisma, body);

    await recordAudit({
      userId: user.id,
      action: "scorecard.panelPeriod.update",
      entity: "AppSetting",
      entityId: "scorecard.panelPeriod",
      newData: { ...saved },
    });

    return NextResponse.json({ period: saved });
  } catch (error) {
    return handleApiError(error);
  }
}

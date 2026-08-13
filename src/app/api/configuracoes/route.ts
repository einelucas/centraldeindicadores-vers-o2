import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";
import { recordAudit } from "@/server/audit";
import { toJsonValue } from "@/server/database/json";
import {
  IDP_EXCLUDED_DISCIPLINES_SETTING_KEY,
  IDP_EXCLUDED_UNITS_SETTING_KEY,
  parseIdpExcludedDisciplines,
  parseIdpExcludedUnits,
} from "@/features/idp/configuration";
import { recalcIdpIndicators } from "@/features/idp/services";

const ACTIVE_SETTING_KEYS = [
  "rdo.target",
  "idp.target",
  IDP_EXCLUDED_DISCIPLINES_SETTING_KEY,
  IDP_EXCLUDED_UNITS_SETTING_KEY,
  "rnc.maxPrazoDias",
  "fiveS.target",
  "fiveS.excludedUnits",
  "taxa-acidentes.target",
] as const;

/** GET /api/configuracoes — lista as configurações do sistema. */
export async function GET() {
  try {
    // Leitura liberada a qualquer usuário autenticado (metas são exibidas
    // nos painéis); a escrita exige settings:manage.
    await requirePermission("indicators:read");
    const settings = await prisma.appSetting.findMany({
      where: { key: { in: [...ACTIVE_SETTING_KEYS] } },
      orderBy: { key: "asc" },
    });
    return NextResponse.json({ items: settings });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  key: z.enum(ACTIVE_SETTING_KEYS),
  value: z.unknown(),
});

/** PATCH /api/configuracoes — cria ou atualiza uma configuração (admin). */
export async function PATCH(req: NextRequest) {
  try {
    const admin = await requirePermission("settings:manage");
    const body = await req.json();
    const { key, value } = patchSchema.parse(body);

    const previous = await prisma.appSetting.findUnique({ where: { key } });
    const normalizedValue =
      key === IDP_EXCLUDED_DISCIPLINES_SETTING_KEY
        ? parseIdpExcludedDisciplines(value)
        : key === IDP_EXCLUDED_UNITS_SETTING_KEY
          ? parseIdpExcludedUnits(value)
          : value;

    const updated = await prisma.$transaction(
      async (tx) => {
        const setting = await tx.appSetting.upsert({
          where: { key },
          create: { key, value: toJsonValue(normalizedValue) },
          update: { value: toJsonValue(normalizedValue) },
        });

        if (
          key === IDP_EXCLUDED_DISCIPLINES_SETTING_KEY ||
          key === IDP_EXCLUDED_UNITS_SETTING_KEY
        ) {
          await recalcIdpIndicators(tx);
        }

        return setting;
      },
      { maxWait: 10_000, timeout: 120_000 },
    );

    await recordAudit({
      userId: admin.id,
      action: "settings.update",
      entity: "AppSetting",
      entityId: key,
      previousData: previous ? { value: previous.value } : undefined,
      newData: { value: updated.value },
    });

    return NextResponse.json({ setting: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

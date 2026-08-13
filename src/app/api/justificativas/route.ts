import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { JUSTIFICATION_MODULES } from "@/features/justifications/types";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { toJsonValue } from "@/server/database/json";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

const keySchema = z.object({
  module: z.enum(JUSTIFICATION_MODULES),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

const saveSchema = z.object({
  module: z.enum(JUSTIFICATION_MODULES),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  text: z.string().trim().min(1).max(10_000),
  suggestedText: z.string().max(10_000).nullable().optional(),
  result: z.number().nullable().optional(),
  target: z.number().nullable().optional(),
  status: z.enum(["BELOW_TARGET", "ON_TARGET", "NO_DATA"]).nullable().optional(),
  evidence: z.array(
    z.object({ label: z.string(), value: z.string(), detail: z.string().optional() }),
  ),
  sourceImport: z
    .object({ id: z.string(), importedAt: z.string().datetime().nullable() })
    .nullable()
    .optional(),
});

const selectJustification = {
  id: true,
  module: true,
  year: true,
  month: true,
  result: true,
  target: true,
  status: true,
  evidence: true,
  suggestedText: true,
  text: true,
  sourceImportId: true,
  sourceImportedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
} as const;

export async function GET(request: NextRequest) {
  try {
    await requirePermission("import:run");
    const input = keySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const records = await prisma.indicatorJustification.findMany({
      where: { module: input.module, year: input.year, month: input.month },
      orderBy: [{ year: "desc" }, { month: "desc" }, { updatedAt: "desc" }],
      select: selectJustification,
    });
    return NextResponse.json({ records });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requirePermission("import:run");
    const input = saveSchema.parse(await request.json());
    const key = {
      module_year_month: { module: input.module, year: input.year, month: input.month },
    };
    const previous = await prisma.indicatorJustification.findUnique({ where: key });
    const common = {
      result: input.result ?? null,
      target: input.target ?? null,
      status: input.status ?? null,
      evidence: toJsonValue(input.evidence),
      suggestedText: input.suggestedText ?? null,
      text: input.text,
      sourceImportId: input.sourceImport?.id ?? null,
      sourceImportedAt: input.sourceImport?.importedAt
        ? new Date(input.sourceImport.importedAt)
        : null,
      updatedById: user.id,
    };
    const record = await prisma.indicatorJustification.upsert({
      where: key,
      create: {
        module: input.module,
        year: input.year,
        month: input.month,
        ...common,
        createdById: user.id,
      },
      update: common,
      select: selectJustification,
    });

    await recordAudit({
      userId: user.id,
      action: previous ? "INDICATOR_JUSTIFICATION_UPDATED" : "INDICATOR_JUSTIFICATION_CREATED",
      entity: "IndicatorJustification",
      entityId: record.id,
      previousData: previous ? JSON.parse(JSON.stringify(previous)) : undefined,
      newData: JSON.parse(JSON.stringify(record)),
      metadata: { module: input.module, year: input.year, month: input.month },
    });
    return NextResponse.json({ record });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requirePermission("import:run");
    const input = keySchema
      .extend({ month: z.coerce.number().int().min(1).max(12) })
      .parse(Object.fromEntries(request.nextUrl.searchParams));
    const record = await prisma.indicatorJustification.findUnique({
      where: { module_year_month: input },
    });
    if (!record) return NextResponse.json({ ok: true });
    await prisma.indicatorJustification.delete({ where: { id: record.id } });
    await recordAudit({
      userId: user.id,
      action: "INDICATOR_JUSTIFICATION_DELETED",
      entity: "IndicatorJustification",
      entityId: record.id,
      previousData: JSON.parse(JSON.stringify(record)),
      metadata: input,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  accidentUnitKey,
  loadAccidentRateData,
  normalizeExcludedUnits,
  saveAccidentExcludedUnits,
  saveAccidentTarget,
} from "@/features/taxa-acidentes/services";
import { normalizeAccidentUnitCode } from "@/features/taxa-acidentes/utils/units";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

const monthlySchema = z.object({
  type: z.literal("month"),
  id: z.string().trim().min(1).optional(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  rate: z.number().min(0),
  caf: z.number().int().min(0),
});

const unitSchema = z.object({
  type: z.literal("unit"),
  id: z.string().trim().min(1).optional(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  unit: z.string().trim().min(1).max(120),
  saf: z.number().int().min(0),
  caf: z.number().int().min(0),
});

const settingsSchema = z.object({
  type: z.literal("settings"),
  target: z.number().min(0),
});

const inputSchema = z.discriminatedUnion("type", [monthlySchema, unitSchema, settingsSchema]);

const monthlySelect = {
  id: true,
  year: true,
  month: true,
  rate: true,
  caf: true,
} as const;

const unitSelect = {
  id: true,
  year: true,
  month: true,
  unit: true,
  unitKey: true,
  saf: true,
  caf: true,
} as const;

function missingTables(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

export async function GET() {
  try {
    await requirePermission("indicators:read");
    const data = await prisma.$transaction((tx) => loadAccidentRateData(tx));
    return NextResponse.json(data);
  } catch (error) {
    if (missingTables(error)) {
      return NextResponse.json({
        setupRequired: true,
        monthly: [],
        units: [],
        target: 7.5,
        excludedUnits: [],
        result: null,
      });
    }
    return handleApiError(error);
  }
}

const excludedUnitsSchema = z.object({
  excludedUnits: z.array(z.string().max(100)).max(100),
});

/** PATCH /api/taxa-acidentes — salva as unidades ignoradas e recalcula. */
export async function PATCH(req: NextRequest) {
  try {
    const user = await requirePermission("import:run");
    const input = excludedUnitsSchema.parse(await req.json());
    const excludedUnits = normalizeExcludedUnits(input.excludedUnits);

    await prisma.$transaction((tx) => saveAccidentExcludedUnits(tx, excludedUnits));

    await recordAudit({
      userId: user.id,
      action: "INDICATOR_SETTINGS_UPDATED",
      entity: "AppSetting",
      entityId: "taxa-acidentes",
      newData: { excludedUnits },
      metadata: { module: "taxa-acidentes" },
    });

    return NextResponse.json({ ok: true, excludedUnits });
  } catch (error) {
    if (missingTables(error)) {
      return NextResponse.json(
        { error: "Execute pnpm db:upgrade:accidents antes de salvar dados." },
        { status: 503 },
      );
    }
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("import:run");
    const input = inputSchema.parse(await req.json());

    if (input.type === "month") {
      const previous = input.id
        ? await prisma.accidentMonthlyRecord.findUnique({
            where: { id: input.id },
            select: monthlySelect,
          })
        : await prisma.accidentMonthlyRecord.findUnique({
            where: { year_month: { year: input.year, month: input.month } },
            select: monthlySelect,
          });

      if (input.id && !previous) {
        return NextResponse.json(
          { error: "O lançamento mensal selecionado não foi encontrado." },
          { status: 404 },
        );
      }

      const conflict = await prisma.accidentMonthlyRecord.findUnique({
        where: { year_month: { year: input.year, month: input.month } },
        select: { id: true },
      });

      if (conflict && conflict.id !== previous?.id) {
        return NextResponse.json(
          { error: "Já existe um lançamento mensal para essa competência." },
          { status: 409 },
        );
      }

      const saved = previous
        ? await prisma.accidentMonthlyRecord.update({
            where: { id: previous.id },
            data: {
              year: input.year,
              month: input.month,
              rate: input.rate,
              caf: input.caf,
            },
            select: monthlySelect,
          })
        : await prisma.accidentMonthlyRecord.create({
            data: {
              year: input.year,
              month: input.month,
              rate: input.rate,
              caf: input.caf,
            },
            select: monthlySelect,
          });

      await recordAudit({
        userId: user.id,
        action: previous ? "RECORD_UPDATED" : "RECORD_CREATED",
        entity: "AccidentMonthlyRecord",
        entityId: saved.id,
        previousData: previous,
        newData: saved,
        metadata: { module: "taxa-acidentes" },
      });
      return NextResponse.json({ saved });
    }

    if (input.type === "unit") {
      const normalizedUnit = normalizeAccidentUnitCode(input.unit);
      const unitKey = accidentUnitKey(normalizedUnit);
      if (!unitKey) {
        return NextResponse.json({ error: "Informe uma unidade válida." }, { status: 400 });
      }

      const previousById = input.id
        ? await prisma.accidentUnitRecord.findUnique({
            where: { id: input.id },
            select: unitSelect,
          })
        : null;

      if (input.id && !previousById) {
        return NextResponse.json(
          { error: "O lançamento da unidade selecionada não foi encontrado." },
          { status: 404 },
        );
      }

      const targetPeriodRows = await prisma.accidentUnitRecord.findMany({
        where: { year: input.year, month: input.month },
        select: unitSelect,
      });
      const equivalentRows = targetPeriodRows.filter(
        (row) => row.id !== input.id && accidentUnitKey(row.unit || row.unitKey) === unitKey,
      );
      const equivalentRow =
        equivalentRows.find((row) => row.unitKey === unitKey) ?? equivalentRows[0];

      if (input.id && equivalentRow) {
        return NextResponse.json(
          { error: "Já existe um lançamento dessa unidade para a competência selecionada." },
          { status: 409 },
        );
      }

      const previous = previousById ?? equivalentRow ?? null;
      const saved = previous
        ? await prisma.accidentUnitRecord.update({
            where: { id: previous.id },
            data: {
              year: input.year,
              month: input.month,
              unit: normalizedUnit,
              unitKey,
              saf: input.saf,
              caf: input.caf,
            },
            select: unitSelect,
          })
        : await prisma.accidentUnitRecord.create({
            data: {
              year: input.year,
              month: input.month,
              unit: normalizedUnit,
              unitKey,
              saf: input.saf,
              caf: input.caf,
            },
            select: unitSelect,
          });

      await recordAudit({
        userId: user.id,
        action: previous ? "RECORD_UPDATED" : "RECORD_CREATED",
        entity: "AccidentUnitRecord",
        entityId: saved.id,
        previousData: previous,
        newData: saved,
        metadata: {
          module: "taxa-acidentes",
          year: input.year,
          month: input.month,
        },
      });
      return NextResponse.json({ saved });
    }

    const previousTarget = await prisma.appSetting.findUnique({
      where: { key: "taxa-acidentes.target" },
      select: { value: true },
    });
    await prisma.$transaction((tx) => saveAccidentTarget(tx, input.target));
    await recordAudit({
      userId: user.id,
      action: "SETTING_UPDATED",
      entity: "AppSetting",
      entityId: "taxa-acidentes.target",
      previousData: { target: Number(previousTarget?.value ?? 7.5) },
      newData: { target: input.target },
      metadata: { module: "taxa-acidentes" },
    });
    return NextResponse.json({ saved: { target: input.target } });
  } catch (error) {
    if (missingTables(error)) {
      return NextResponse.json(
        { error: "Execute pnpm db:upgrade:accidents antes de salvar dados." },
        { status: 503 },
      );
    }
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const kind = req.nextUrl.searchParams.get("kind");
    const user = await requirePermission(kind === "all" ? "indicators:edit" : "import:run");

    if (kind === "month") {
      const year = Number(req.nextUrl.searchParams.get("year"));
      const month = Number(req.nextUrl.searchParams.get("month"));
      if (!Number.isInteger(year) || !Number.isInteger(month)) {
        return NextResponse.json({ error: "Período inválido." }, { status: 400 });
      }
      const previous = await prisma.accidentMonthlyRecord.findUnique({
        where: { year_month: { year, month } },
        select: monthlySelect,
      });
      if (previous) {
        await prisma.accidentMonthlyRecord.delete({ where: { id: previous.id } });
        await recordAudit({
          userId: user.id,
          action: "RECORD_DELETED",
          entity: "AccidentMonthlyRecord",
          entityId: previous.id,
          previousData: previous,
          metadata: { module: "taxa-acidentes" },
        });
      }
      return NextResponse.json({ ok: true, deleted: previous ? 1 : 0 });
    }

    if (kind === "unit") {
      const id = req.nextUrl.searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "Unidade inválida." }, { status: 400 });
      }
      const previous = await prisma.accidentUnitRecord.findUnique({
        where: { id },
        select: unitSelect,
      });
      if (previous) {
        await prisma.accidentUnitRecord.delete({ where: { id } });
        await recordAudit({
          userId: user.id,
          action: "RECORD_DELETED",
          entity: "AccidentUnitRecord",
          entityId: previous.id,
          previousData: previous,
          metadata: { module: "taxa-acidentes" },
        });
      }
      return NextResponse.json({ ok: true, deleted: previous ? 1 : 0 });
    }

    if (kind === "all") {
      const [monthlyCount, unitCount] = await Promise.all([
        prisma.accidentMonthlyRecord.count(),
        prisma.accidentUnitRecord.count(),
      ]);
      await prisma.$transaction(async (tx) => {
        await tx.accidentMonthlyRecord.deleteMany();
        await tx.accidentUnitRecord.deleteMany();
        await tx.indicatorResult.deleteMany({
          where: { module: "taxa-acidentes" },
        });
      });
      await recordAudit({
        userId: user.id,
        action: "RECORDS_CLEARED",
        entity: "AccidentRate",
        previousData: { monthlyCount, unitCount },
        metadata: { module: "taxa-acidentes", escopo: "todos" },
      });
      return NextResponse.json({
        ok: true,
        deleted: monthlyCount + unitCount,
      });
    }

    return NextResponse.json({ error: "Operação inválida." }, { status: 400 });
  } catch (error) {
    if (missingTables(error)) {
      return NextResponse.json(
        { error: "Execute pnpm db:upgrade:accidents antes de remover dados." },
        { status: 503 },
      );
    }
    return handleApiError(error);
  }
}

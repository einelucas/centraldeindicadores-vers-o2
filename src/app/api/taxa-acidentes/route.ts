import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  accidentUnitKey,
  loadAccidentRateData,
  saveAccidentTarget,
} from "@/features/taxa-acidentes/services";
import { recordAudit } from "@/server/audit";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

const monthlySchema = z.object({
  type: z.literal("month"),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  rate: z.number().min(0),
  caf: z.number().int().min(0),
});

const unitSchema = z.object({
  type: z.literal("unit"),
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

const inputSchema = z.discriminatedUnion("type", [
  monthlySchema,
  unitSchema,
  settingsSchema,
]);

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
        result: null,
      });
    }
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("import:run");
    const input = inputSchema.parse(await req.json());

    if (input.type === "month") {
      const previous = await prisma.accidentMonthlyRecord.findUnique({
        where: { year_month: { year: input.year, month: input.month } },
        select: { id: true, year: true, month: true, rate: true, caf: true },
      });
      const saved = await prisma.accidentMonthlyRecord.upsert({
        where: { year_month: { year: input.year, month: input.month } },
        create: {
          year: input.year,
          month: input.month,
          rate: input.rate,
          caf: input.caf,
        },
        update: { rate: input.rate, caf: input.caf },
        select: { id: true, year: true, month: true, rate: true, caf: true },
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
      const unitKey = accidentUnitKey(input.unit);
      if (!unitKey) {
        return NextResponse.json(
          { error: "Informe uma unidade válida." },
          { status: 400 },
        );
      }
      const where = {
        year_month_unitKey: {
          year: input.year,
          month: input.month,
          unitKey,
        },
      } as const;
      const previous = await prisma.accidentUnitRecord.findUnique({
        where,
        select: {
          id: true,
          year: true,
          month: true,
          unit: true,
          unitKey: true,
          saf: true,
          caf: true,
        },
      });
      const saved = await prisma.accidentUnitRecord.upsert({
        where,
        create: {
          year: input.year,
          month: input.month,
          unit: input.unit,
          unitKey,
          saf: input.saf,
          caf: input.caf,
        },
        update: { unit: input.unit, saf: input.saf, caf: input.caf },
        select: {
          id: true,
          year: true,
          month: true,
          unit: true,
          unitKey: true,
          saf: true,
          caf: true,
        },
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
    const user = await requirePermission(
      kind === "all" ? "indicators:edit" : "import:run",
    );

    if (kind === "month") {
      const year = Number(req.nextUrl.searchParams.get("year"));
      const month = Number(req.nextUrl.searchParams.get("month"));
      if (!Number.isInteger(year) || !Number.isInteger(month)) {
        return NextResponse.json({ error: "Período inválido." }, { status: 400 });
      }
      const previous = await prisma.accidentMonthlyRecord.findUnique({
        where: { year_month: { year, month } },
        select: { id: true, year: true, month: true, rate: true, caf: true },
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
        select: {
          id: true,
          year: true,
          month: true,
          unit: true,
          unitKey: true,
          saf: true,
          caf: true,
        },
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

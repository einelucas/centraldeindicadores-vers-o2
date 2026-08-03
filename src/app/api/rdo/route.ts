import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { computeRdoResult } from "@/features/rdo/calculations";
import { RDO_DEFAULT_TARGET, type RdoNormalizedRecord } from "@/features/rdo/types";
import { requirePermission } from "@/server/auth/session";
import { prisma } from "@/server/database/prisma";
import { handleApiError } from "@/server/http";

/**
 * GET /api/rdo — agregados completos do RDO e até 1.000 registros de detalhe.
 * Os cálculos não têm mais o antigo corte de 5.000 linhas: todos os registros
 * que atendem aos filtros participam dos cards e tabelas.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePermission("indicators:read");
    const { searchParams } = new URL(req.url);

    const unidade = searchParams.get("unidade")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() || undefined;
    const q = searchParams.get("q")?.trim() || undefined;
    const ano = searchParams.get("ano");
    const mes = searchParams.get("mes");
    const thresholdParam = searchParams.get("threshold");
    const parsedThreshold = thresholdParam ? Number(thresholdParam) / 100 : RDO_DEFAULT_TARGET;
    const threshold = Number.isFinite(parsedThreshold)
      ? Math.min(1, Math.max(0, parsedThreshold))
      : RDO_DEFAULT_TARGET;

    const where: Prisma.RdoRecordWhereInput = {};
    if (unidade) where.empresaNome = unidade;
    if (status) where.statusDescricao = status;
    if (ano && Number.isFinite(Number(ano))) where.year = Number(ano);
    if (mes && Number.isFinite(Number(mes))) where.month = Number(mes);
    if (q) {
      where.OR = [
        { empresaNome: { contains: q, mode: "insensitive" } },
        { disciplina: { contains: q, mode: "insensitive" } },
        { grupo: { contains: q, mode: "insensitive" } },
        { relatorioId: { contains: q, mode: "insensitive" } },
      ];
    }

    const [calculationRows, detailRows, total, allForOptions, lastImport] =
      await Promise.all([
        prisma.rdoRecord.findMany({
          where,
          select: {
            dataReferencia: true,
            empresaNome: true,
            statusDescricao: true,
            relatorioId: true,
            grupo: true,
            disciplina: true,
            year: true,
            month: true,
            raw: true,
          },
          orderBy: [{ dataReferencia: "asc" }, { empresaNome: "asc" }],
        }),
        prisma.rdoRecord.findMany({
          where,
          select: {
            id: true,
            dataReferencia: true,
            empresaNome: true,
            grupo: true,
            disciplina: true,
            statusDescricao: true,
            relatorioId: true,
            editedManually: true,
          },
          orderBy: [{ dataReferencia: "desc" }, { empresaNome: "asc" }],
          take: 1000,
        }),
        prisma.rdoRecord.count({ where }),
        prisma.rdoRecord.findMany({
          select: { empresaNome: true, year: true, statusDescricao: true },
          distinct: ["empresaNome", "year", "statusDescricao"],
        }),
        prisma.importJob.findFirst({
          where: { module: "rdo", status: { in: ["COMPLETED", "COMPLETED_WITH_ERRORS"] } },
          orderBy: { completedAt: "desc" },
          select: {
            id: true,
            fileName: true,
            completedAt: true,
            totalFound: true,
            totalInserted: true,
            totalUpdated: true,
            totalIgnored: true,
            totalRejected: true,
          },
        }),
      ]);

    const records: RdoNormalizedRecord[] = calculationRows.map((row) => ({
      dataReferencia: row.dataReferencia,
      empresaNome: row.empresaNome,
      statusDescricao: row.statusDescricao,
      relatorioId: row.relatorioId,
      grupo: row.grupo,
      disciplina: row.disciplina,
      year: row.year,
      month: row.month,
      raw: (row.raw as Record<string, unknown>) ?? {},
    }));

    const result = computeRdoResult(records, threshold);

    const unidades = Array.from(
      new Set(allForOptions.map((row) => row.empresaNome).filter(Boolean)),
    ).sort();
    const anos = Array.from(new Set(allForOptions.map((row) => row.year))).sort(
      (a, b) => b - a,
    );
    const statusList = Array.from(
      new Set(allForOptions.map((row) => row.statusDescricao).filter(Boolean)),
    ).sort();

    const detalhe = detailRows.map((row) => ({
      id: row.id,
      data: row.dataReferencia,
      unidade: row.empresaNome,
      grupo: row.grupo,
      disciplina: row.disciplina,
      status: row.statusDescricao,
      relatorioId: row.relatorioId,
      editedManually: row.editedManually,
    }));

    return NextResponse.json({
      total,
      threshold,
      result,
      detalhe,
      detalheLimitado: total > detalhe.length,
      filtros: { unidades, anos, status: statusList },
      lastImport,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Serviço do RDO no backend.
 * - Revalida os registros com Zod.
 * - Gera businessKey/contentHash NO SERVIDOR (fonte de verdade).
 * - Converte para IncrementalRecord para o motor de importação.
 * - Recalcula o indicador consolidado do RDO após finalizar.
 */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import { rdoRecordSchema, type RdoRecordInput } from "@/features/rdo/schemas";
import { rdoBusinessKey, rdoContentHash } from "@/features/rdo/utils/keys";
import { normalizeRdoUnitCode } from "@/features/rdo/utils/units";
import { computeRdoResult } from "@/features/rdo/calculations";
import { loadRdoRecords } from "@/features/rdo/repositories";
import { RDO_DEFAULT_TARGET, type RdoNormalizedRecord } from "@/features/rdo/types";
import type { IncrementalRecord } from "@/importers/shared/incremental-upsert";

export const RDO_EXCLUDED_SETTING = "rdo.excludedUnits";

export function normalizeExcludedUnits(values: readonly string[]): string[] {
  return Array.from(new Set(values.map(normalizeRdoUnitCode).filter(Boolean)));
}

export async function loadRdoConfiguration(
  tx: Prisma.TransactionClient,
): Promise<{ excludedUnits: string[] }> {
  const setting = await tx.appSetting.findUnique({
    where: { key: RDO_EXCLUDED_SETTING },
    select: { value: true },
  });
  const excludedUnits = Array.isArray(setting?.value)
    ? normalizeExcludedUnits(setting.value.map((value) => String(value)))
    : [];
  return { excludedUnits };
}

/** Revalida e converte o input JSON em IncrementalRecord com chaves do servidor. */
export function toIncrementalRecords(rawRecords: unknown[]): {
  records: IncrementalRecord[];
  rejected: number;
} {
  const records: IncrementalRecord[] = [];
  let rejected = 0;

  for (const raw of rawRecords) {
    const parsed = rdoRecordSchema.safeParse(raw);
    if (!parsed.success) {
      rejected++;
      continue;
    }
    const input: RdoRecordInput = parsed.data;
    const record: RdoNormalizedRecord = {
      dataReferencia: new Date(input.dataReferencia),
      empresaNome: input.empresaNome,
      statusDescricao: input.statusDescricao,
      relatorioId: input.relatorioId,
      grupo: input.grupo,
      disciplina: input.disciplina,
      year: input.year,
      month: input.month,
      raw: input.raw,
    };
    if (isNaN(record.dataReferencia.getTime())) {
      rejected++;
      continue;
    }
    records.push({
      businessKey: rdoBusinessKey(record),
      contentHash: rdoContentHash(record),
      data: record as unknown as Record<string, unknown>,
    });
  }

  return { records, rejected };
}

/**
 * Recalcula o IndicatorResult do RDO a partir dos registros persistidos.
 * Grava resultado consolidado (unit __ALL__) e por unidade.
 */
export async function recalcRdoIndicators(tx: Prisma.TransactionClient): Promise<void> {
  const rows = await loadRdoRecords(tx);
  type LoadedRdo = {
    dataReferencia: Date;
    empresaNome: string;
    statusDescricao: string;
    relatorioId: string | null;
    grupo: string | null;
    disciplina: string | null;
    year: number;
    month: number;
    raw: unknown;
  };
  const records: RdoNormalizedRecord[] = (rows as LoadedRdo[]).map((r) => ({
    dataReferencia: r.dataReferencia,
    empresaNome: r.empresaNome,
    statusDescricao: r.statusDescricao,
    relatorioId: r.relatorioId,
    grupo: r.grupo,
    disciplina: r.disciplina,
    year: r.year,
    month: r.month,
    raw: (r.raw as Record<string, unknown>) ?? {},
  }));

  const configuration = await loadRdoConfiguration(tx);

  // Recalcula por (ano, mês) presentes nos dados.
  const periods = new Set(records.map((r) => `${r.year}-${r.month}`));

  for (const period of periods) {
    const [yStr, mStr] = period.split("-");
    const year = Number(yStr);
    const month = Number(mStr);
    const subset = records.filter((r) => r.year === year && r.month === month);
    const result = computeRdoResult(subset, RDO_DEFAULT_TARGET, configuration.excludedUnits);
    const adherence = result.totalEmitidos > 0 ? result.totalAprovados / result.totalEmitidos : 0;

    await tx.indicatorResult.upsert({
      where: {
        module_indicator_unit_year_month: {
          module: "rdo",
          indicator: "aprovacao",
          unit: "__ALL__",
          year,
          month,
        },
      },
      create: {
        module: "rdo",
        indicator: "aprovacao",
        unit: "__ALL__",
        year,
        month,
        value: adherence,
        target: RDO_DEFAULT_TARGET,
        adherence,
        status: adherence >= RDO_DEFAULT_TARGET ? "OK" : "ABAIXO",
        details: toJsonValue({
          totalEmitidos: result.totalEmitidos,
          totalAprovados: result.totalAprovados,
          totalRevisar: result.totalRevisar,
          totalPreenchendo: result.totalPreenchendo,
          unitAvg: result.unitAvg,
        }),
      },
      update: {
        value: adherence,
        target: RDO_DEFAULT_TARGET,
        adherence,
        status: adherence >= RDO_DEFAULT_TARGET ? "OK" : "ABAIXO",
        details: toJsonValue({
          totalEmitidos: result.totalEmitidos,
          totalAprovados: result.totalAprovados,
          totalRevisar: result.totalRevisar,
          totalPreenchendo: result.totalPreenchendo,
          unitAvg: result.unitAvg,
        }),
      },
    });
  }
}

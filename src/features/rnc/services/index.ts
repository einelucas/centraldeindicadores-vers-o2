/**
 * Serviço do RNC no backend.
 * - Revalida os registros com Zod.
 * - Gera businessKey/contentHash NO SERVIDOR.
 * - Recalcula o indicador (dias médios de tratativa) por período de criação.
 */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import { rncRecordSchema, type RncRecordInput } from "@/features/rnc/schemas";
import { rncBusinessKey, rncContentHash } from "@/features/rnc/utils/keys";
import { computeRncResult } from "@/features/rnc/calculations";
import { loadRncRecords } from "@/features/rnc/repositories";
import { RNC_DEFAULT_MAX_DIAS, type RncNormalizedRecord } from "@/features/rnc/types";
import { normalizeRncUnitCode } from "@/features/rnc/utils/units";
import type { IncrementalRecord } from "@/importers/shared/incremental-upsert";

export const RNC_EXCLUDED_SETTING = "rnc.excludedUnits";

export function normalizeExcludedUnits(values: readonly string[]): string[] {
  return Array.from(new Set(values.map(normalizeRncUnitCode).filter(Boolean)));
}

export async function loadRncConfiguration(
  tx: Prisma.TransactionClient,
): Promise<{ excludedUnits: string[] }> {
  const setting = await tx.appSetting.findUnique({
    where: { key: RNC_EXCLUDED_SETTING },
    select: { value: true },
  });
  const excludedUnits = Array.isArray(setting?.value)
    ? normalizeExcludedUnits(setting.value.map((value) => String(value)))
    : [];
  return { excludedUnits };
}

export function toIncrementalRecords(rawRecords: unknown[]): {
  records: IncrementalRecord[];
  rejected: number;
} {
  const records: IncrementalRecord[] = [];
  let rejected = 0;

  for (const raw of rawRecords) {
    const parsed = rncRecordSchema.safeParse(raw);
    if (!parsed.success) {
      rejected++;
      continue;
    }
    const input: RncRecordInput = parsed.data;
    const dataCriacao = new Date(input.dataCriacao);
    if (isNaN(dataCriacao.getTime())) {
      rejected++;
      continue;
    }
    const record: RncNormalizedRecord = {
      statusRnc: input.statusRnc,
      unidade: input.unidade,
      dataCriacao,
      dataSolucao: input.dataSolucao ? new Date(input.dataSolucao) : null,
      tempoTratativa: input.tempoTratativa,
      ofensor: input.ofensor,
      year: input.year,
      month: input.month,
      raw: input.raw,
    };
    records.push({
      businessKey: rncBusinessKey(record),
      contentHash: rncContentHash(record),
      data: {
        ...record,
        dataCriacao: record.dataCriacao.toISOString(),
        dataSolucao: record.dataSolucao ? record.dataSolucao.toISOString() : null,
      } as unknown as Record<string, unknown>,
    });
  }

  return { records, rejected };
}

export async function recalcRncIndicators(tx: Prisma.TransactionClient): Promise<void> {
  const rows = await loadRncRecords(tx);
  type LoadedRnc = {
    statusRnc: string;
    unidade: string;
    dataCriacao: Date;
    dataSolucao: Date | null;
    tempoTratativa: number | null;
    ofensor: string;
    year: number;
    month: number;
    raw: unknown;
  };
  const records: RncNormalizedRecord[] = (rows as LoadedRnc[]).map((r) => ({
    statusRnc: r.statusRnc,
    unidade: r.unidade,
    dataCriacao: r.dataCriacao,
    dataSolucao: r.dataSolucao,
    tempoTratativa: r.tempoTratativa,
    ofensor: r.ofensor,
    year: r.year,
    month: r.month,
    raw: (r.raw as Record<string, unknown>) ?? {},
  }));

  const configuration = await loadRncConfiguration(tx);
  const result = computeRncResult(records, RNC_DEFAULT_MAX_DIAS, configuration.excludedUnits);

  // Um IndicatorResult por mês de criação: valor = dias médios de tratativa.
  for (const month of result.months) {
    const dias = month.diasMedios;
    // Menor é melhor: status OK se dentro da meta (<= metaDias).
    const dentro = dias !== null && dias <= result.metaDias;
    await tx.indicatorResult.upsert({
      where: {
        module_indicator_unit_year_month: {
          module: "rnc",
          indicator: "dias_tratativa",
          unit: "__ALL__",
          year: month.year,
          month: month.month + 1, // month é 0-based no agregado
        },
      },
      create: {
        module: "rnc",
        indicator: "dias_tratativa",
        unit: "__ALL__",
        year: month.year,
        month: month.month + 1,
        value: dias ?? 0,
        target: result.metaDias,
        adherence: month.chamados ? month.solucionados / month.chamados : 0,
        status: dias === null ? "SEM_DADOS" : dentro ? "OK" : "ABAIXO",
        details: toJsonValue({
          chamados: month.chamados,
          solucionados: month.solucionados,
          diasMedios: dias,
        }),
      },
      update: {
        value: dias ?? 0,
        target: result.metaDias,
        adherence: month.chamados ? month.solucionados / month.chamados : 0,
        status: dias === null ? "SEM_DADOS" : dentro ? "OK" : "ABAIXO",
        details: toJsonValue({
          chamados: month.chamados,
          solucionados: month.solucionados,
          diasMedios: dias,
        }),
      },
    });
  }
}

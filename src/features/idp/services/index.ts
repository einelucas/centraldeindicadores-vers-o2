/**
 * Serviço do IDP no backend.
 * - Revalida os registros com Zod.
 * - Gera businessKey/contentHash NO SERVIDOR (fonte de verdade).
 * - Converte para IncrementalRecord.
 * - Recalcula o indicador consolidado do IDP após finalizar.
 */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import { idpRecordSchema, type IdpRecordInput } from "@/features/idp/schemas";
import { idpBusinessKey, idpContentHash } from "@/features/idp/utils/keys";
import { computeIdpResult } from "@/features/idp/calculations";
import {
  filterIdpExcludedDisciplines,
  loadIdpExcludedDisciplines,
} from "@/features/idp/configuration";
import { loadIdpRecords } from "@/features/idp/repositories";
import {
  IDP_DEFAULT_TARGET,
  type IdpNormalizedRecord,
} from "@/features/idp/types";
import type { IncrementalRecord } from "@/importers/shared/incremental-upsert";

/** Revalida e converte o input JSON em IncrementalRecord com chaves do servidor. */
export function toIncrementalRecords(rawRecords: unknown[]): {
  records: IncrementalRecord[];
  rejected: number;
} {
  const records: IncrementalRecord[] = [];
  let rejected = 0;

  for (const raw of rawRecords) {
    const parsed = idpRecordSchema.safeParse(raw);
    if (!parsed.success) {
      rejected++;
      continue;
    }
    const input: IdpRecordInput = parsed.data;
    const record: IdpNormalizedRecord = {
      unit: input.unit,
      year: input.year,
      month: input.month,
      disciplina: input.disciplina,
      custoLinhaBase: input.custoLinhaBase,
      custoReal: input.custoReal,
      raw: input.raw,
    };
    records.push({
      businessKey: idpBusinessKey(record),
      contentHash: idpContentHash(record),
      data: record as unknown as Record<string, unknown>,
    });
  }

  return { records, rejected };
}

/**
 * Recalcula o IndicatorResult do IDP a partir dos registros persistidos.
 * Grava resultado consolidado (unit __ALL__) por período (ano, mês).
 */
export async function recalcIdpIndicators(
  tx: Prisma.TransactionClient,
): Promise<void> {
  const rows = await loadIdpRecords(tx);
  type LoadedIdp = {
    unit: string;
    year: number;
    month: number;
    disciplina: string;
    custoLinhaBase: number;
    custoReal: number;
    raw: unknown;
  };
  const allRecords: IdpNormalizedRecord[] = (rows as LoadedIdp[]).map((r) => ({
    unit: r.unit,
    year: r.year,
    month: r.month,
    disciplina: r.disciplina,
    custoLinhaBase: r.custoLinhaBase,
    custoReal: r.custoReal,
    raw: (r.raw as Record<string, unknown>) ?? {},
  }));
  const excludedDisciplines = await loadIdpExcludedDisciplines(tx);
  const records = filterIdpExcludedDisciplines(allRecords, excludedDisciplines);

  // Evita deixar resultados antigos quando uma configuração passa a excluir
  // todas as linhas de um período anteriormente calculado.
  await tx.indicatorResult.deleteMany({
    where: {
      module: "idp",
      indicator: "aderencia",
      unit: "__ALL__",
    },
  });

  const periods = new Set(records.map((r) => `${r.year}-${r.month}`));

  for (const period of periods) {
    const [yStr, mStr] = period.split("-");
    const year = Number(yStr);
    const month = Number(mStr);
    const subset = records.filter((r) => r.year === year && r.month === month);
    const result = computeIdpResult(subset, IDP_DEFAULT_TARGET);
    const adherence = result.aderenciaGeral;

    await tx.indicatorResult.upsert({
      where: {
        module_indicator_unit_year_month: {
          module: "idp",
          indicator: "aderencia",
          unit: "__ALL__",
          year,
          month,
        },
      },
      create: {
        module: "idp",
        indicator: "aderencia",
        unit: "__ALL__",
        year,
        month,
        value: adherence,
        target: IDP_DEFAULT_TARGET,
        adherence,
        status: adherence >= IDP_DEFAULT_TARGET ? "OK" : "ABAIXO",
        details: toJsonValue({
          totalLinhaBase: result.totalLinhaBase,
          totalReal: result.totalReal,
          disciplinas: result.disciplinas.length,
          units: result.units.length,
        }),
      },
      update: {
        value: adherence,
        target: IDP_DEFAULT_TARGET,
        adherence,
        status: adherence >= IDP_DEFAULT_TARGET ? "OK" : "ABAIXO",
        details: toJsonValue({
          totalLinhaBase: result.totalLinhaBase,
          totalReal: result.totalReal,
          disciplinas: result.disciplinas.length,
          units: result.units.length,
        }),
      },
    });
  }
}

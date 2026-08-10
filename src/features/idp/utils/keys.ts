/** Chaves do IDP por RSO semanal. */

import { makeBusinessKey, makeContentHash } from "@/lib/hashing";
import { normalizedUnitKey } from "@/features/idp/calculations";
import type { IdpNormalizedRecord } from "@/features/idp/types";

/**
 * Identidade lógica: unidade + número do RSO.
 * O número do RSO é a versão semanal do documento; corrigir competência ou
 * reimportar o mesmo PDF atualiza a mesma versão em vez de duplicá-la.
 */
export function idpBusinessKey(record: IdpNormalizedRecord): string {
  return makeBusinessKey("IDP_RSO", [
    normalizedUnitKey(record.unit),
    String(record.rsoNumero ?? "SEM_RSO"),
  ]);
}

export function idpContentHash(record: IdpNormalizedRecord): string {
  return makeContentHash({
    unit: record.unit,
    rsoNumero: record.rsoNumero,
    referenceYear: record.referenceYear,
    referenceMonth: record.referenceMonth,
    referenceSource: record.referenceSource,
    referenceAdjusted: record.referenceAdjusted,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    emissionDate: record.emissionDate,
    areas: record.areas,
    discData: record.discData,
    execucaoFases: record.execucaoFases,
  });
}

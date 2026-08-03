/**
 * Chaves do IDP.
 *
 * businessKey (identidade lógica):
 *   unit + year + month + disciplina
 *   (uma linha de aderência por projeto/mês/disciplina)
 *
 * contentHash (campos mutáveis):
 *   custoLinhaBase + custoReal (valores podem ser corrigidos numa reimportação)
 */

import { makeBusinessKey, makeContentHash } from "@/lib/hashing";
import type { IdpNormalizedRecord } from "@/features/idp/types";

export function idpBusinessKey(record: IdpNormalizedRecord): string {
  return makeBusinessKey("IDP", [
    record.unit,
    String(record.year),
    String(record.month),
    record.disciplina,
  ]);
}

export function idpContentHash(record: IdpNormalizedRecord): string {
  return makeContentHash({
    custoLinhaBase: record.custoLinhaBase,
    custoReal: record.custoReal,
  });
}

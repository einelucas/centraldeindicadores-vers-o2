/**
 * Chaves do 5S.
 *
 * businessKey (identidade lógica):
 *   unit + year + month (uma auditoria por unidade/mês)
 *
 * contentHash (campos mutáveis):
 *   as áreas (divisao/area/meta/nota) — se a auditoria for corrigida e
 *   reenviada, o hash muda e o registro é atualizado.
 */

import { makeBusinessKey, makeContentHash } from "@/lib/hashing";
import type { FiveSNormalizedRecord } from "@/features/cinco-s/types";
import { normalizeFiveSUnitCode } from "@/features/cinco-s/utils/units";

export function fiveSBusinessKey(record: FiveSNormalizedRecord): string {
  return makeBusinessKey("5S", [
    normalizeFiveSUnitCode(record.unit),
    String(record.year),
    String(record.month),
  ]);
}

export function fiveSContentHash(record: FiveSNormalizedRecord): string {
  // Ordena as áreas para o hash ser estável independente da ordem de leitura.
  const areas = record.areas
    .map((a) => `${a.divisao ?? ""}|${a.area}|${a.meta}|${a.nota}`)
    .sort();
  return makeContentHash({ areas });
}

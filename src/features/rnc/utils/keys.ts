/**
 * Chaves do RNC.
 *
 * businessKey (identidade lógica):
 *   unidade + data de criação + ofensor + status inicial de identificação.
 *   Como o export não traz um ID de chamado estável, compomos a identidade
 *   pelos campos que não mudam entre reimportações do mesmo chamado.
 *
 * contentHash (campos mutáveis):
 *   statusRnc + dataSolucao + tempoTratativa (evoluem conforme a tratativa).
 */

import { makeBusinessKey, makeContentHash } from "@/lib/hashing";
import { toIsoDateKey } from "@/lib/dates";
import type { RncNormalizedRecord } from "@/features/rnc/types";

export function rncBusinessKey(record: RncNormalizedRecord): string {
  return makeBusinessKey("RNC", [
    record.unidade,
    toIsoDateKey(record.dataCriacao),
    record.ofensor,
    // desambiguador: descrição/observação se existir no raw
    String(record.raw["descrição"] ?? record.raw["descricao"] ?? ""),
  ]);
}

export function rncContentHash(record: RncNormalizedRecord): string {
  return makeContentHash({
    statusRnc: record.statusRnc,
    dataSolucao: record.dataSolucao ? toIsoDateKey(record.dataSolucao) : "",
    tempoTratativa: record.tempoTratativa,
  });
}

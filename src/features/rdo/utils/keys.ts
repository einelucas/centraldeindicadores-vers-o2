/**
 * Chaves do RDO.
 *
 * IMPORTANTE (do enunciado e do comentário no HTML):
 * a chave do RDO NÃO pode usar somente relatorio_id, pois o mesmo relatório
 * pode ter várias linhas por grupo/disciplina. Compomos a identidade lógica
 * com os campos estáveis.
 *
 * businessKey (identidade lógica):
 *   relatorioId + dataReferencia + empresa + grupo + disciplina
 *
 * contentHash (campos mutáveis):
 *   statusDescricao (+ outros campos sujeitos a atualização, se existirem no raw)
 */

import { makeBusinessKey, makeContentHash } from "@/lib/hashing";
import { toIsoDateKey } from "@/lib/dates";
import type { RdoNormalizedRecord } from "@/features/rdo/types";

export function rdoBusinessKey(record: RdoNormalizedRecord): string {
  return makeBusinessKey("RDO", [
    record.relatorioId ?? "",
    toIsoDateKey(record.dataReferencia),
    record.empresaNome,
    record.grupo ?? "",
    record.disciplina ?? "",
  ]);
}

export function rdoContentHash(record: RdoNormalizedRecord): string {
  // Campos mutáveis do RDO. status_descricao é o principal.
  // Campos adicionais eventualmente presentes no raw e sujeitos a mudança
  // podem ser incluídos aqui sem quebrar registros antigos.
  return makeContentHash({
    statusDescricao: record.statusDescricao,
    responsavel: record.raw["responsavel"] ?? record.raw["responsável"] ?? "",
    observacao: record.raw["observacao"] ?? record.raw["observação"] ?? "",
  });
}

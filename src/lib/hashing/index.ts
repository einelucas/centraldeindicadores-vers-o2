/**
 * Geração de businessKey e contentHash.
 *
 * businessKey  = identidade lógica do registro (campos estáveis).
 * contentHash  = SHA-256 dos campos mutáveis (status, responsável, etc.).
 *
 * As chaves são geradas no backend (mesmo que o frontend gere uma prévia).
 * Usa o módulo `crypto` do Node.js quando disponível; cai para Web Crypto
 * (async) apenas no navegador para pré-visualização.
 */

import { createHash } from "node:crypto";
import { normalizeForKey } from "@/lib/normalization";

/**
 * Monta uma string de chave a partir de partes, normalizando cada uma
 * (caixa alta + espaços colapsados) e unindo por "|".
 */
export function buildKeyString(parts: Array<unknown>): string {
  return parts.map((p) => normalizeForKey(p)).join("|");
}

/** SHA-256 hex de uma string (Node.js). */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * businessKey: hash estável da identidade lógica.
 * Recebe as partes que identificam unicamente o registro no módulo.
 */
export function makeBusinessKey(module: string, parts: Array<unknown>): string {
  return module.toUpperCase() + ":" + sha256(buildKeyString(parts));
}

/**
 * contentHash: hash dos campos mutáveis.
 * Ordena as chaves para ser determinístico independente da ordem de inserção.
 */
export function makeContentHash(mutableFields: Record<string, unknown>): string {
  const ordered = Object.keys(mutableFields)
    .sort()
    .map((k) => k + "=" + normalizeForKey(mutableFields[k]))
    .join("|");
  return sha256(ordered);
}

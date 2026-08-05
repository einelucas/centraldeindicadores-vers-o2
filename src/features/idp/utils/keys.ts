/** Chaves incrementais dos documentos RSO do IDP. */

import { makeBusinessKey, makeContentHash } from "@/lib/hashing";
import type { IdpNormalizedRecord } from "@/features/idp/types";

/**
 * O helper global normaliza valores com String(value), o que transforma objetos
 * aninhados em "[object Object]". Os RSOs possuem fases e áreas em JSON; por
 * isso serializamos recursivamente com chaves ordenadas antes de gerar o hash.
 */
function stableSerialize(value: unknown): string {
  if (value === null || value === undefined) return String(value ?? null);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function idpBusinessKey(record: IdpNormalizedRecord): string {
  return makeBusinessKey("IDP-RSO", [
    record.unit,
    record.rsoNumero === null ? record.fileName : String(record.rsoNumero),
  ]);
}

export function idpContentHash(record: IdpNormalizedRecord): string {
  return makeContentHash({
    unit: record.unit,
    rsoNumero: record.rsoNumero,
    referenceDate: record.referenceDate,
    areas: stableSerialize(record.areas),
    discData: stableSerialize(record.discData),
    execucaoFases: stableSerialize(record.execucaoFases),
  });
}

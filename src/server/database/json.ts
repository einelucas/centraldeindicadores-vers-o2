import { Prisma } from "@prisma/client";

/**
 * Valor JSON serializável genérico, aceito na camada de domínio.
 * Inclui `null` porque nossos dados normalizados podem conter campos nulos.
 */
export type JsonInput =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonInput | undefined }
  | JsonInput[];

/**
 * Converte um valor de domínio para o tipo que o Prisma aceita em campos `Json`.
 *
 * O Prisma não aceita `null` literal em colunas Json (é ambíguo entre "JSON null"
 * e "SQL NULL"); é preciso usar `Prisma.JsonNull`. Este helper faz essa ponte,
 * mantendo o restante do código livre desse detalhe.
 */
export function toJsonValue(
  value: JsonInput | Record<string, unknown> | unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}

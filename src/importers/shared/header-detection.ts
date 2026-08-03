/**
 * Detecção de cabeçalho em planilhas.
 * Migrado de parseWithHeaderDetection() + deriveProjectNameFromFile() do HTML.
 *
 * Exports de MS Project (IDP) e outras planilhas frequentemente têm linhas em
 * branco ou de título antes do cabeçalho real. Esta função varre as primeiras
 * linhas procurando a que contém todas as colunas obrigatórias e devolve os
 * dados a partir dali, com as chaves normalizadas (normHeader).
 */

import { normHeader } from "@/lib/normalization";

/**
 * Procura o cabeçalho numa matriz (array de arrays) e devolve as linhas de
 * dados como objetos { colunaNormalizada: valor }. Retorna null se não achar
 * uma linha contendo todas as `requiredCols` (já normalizadas).
 */
export function parseWithHeaderDetection(
  matrix: unknown[][],
  requiredCols: readonly string[],
): Array<Record<string, unknown>> | null {
  const scanLimit = Math.min(30, matrix.length);

  for (let i = 0; i < scanLimit; i++) {
    const row = matrix[i] ?? [];
    const normed = row.map((v) => normHeader(v));
    const hasAll = requiredCols.every((rc) => normed.includes(rc));
    if (!hasAll) continue;

    const headerRow = row;
    const dataRows = matrix.slice(i + 1);
    return dataRows
      .map((r) => {
        const obj: Record<string, unknown> = {};
        headerRow.forEach((h, idx) => {
          if (h === null || h === "") return;
          obj[normHeader(h)] = r[idx] === undefined ? null : r[idx];
        });
        return obj;
      })
      .filter((r) =>
        Object.values(r).some((v) => v !== null && v !== ""),
      );
  }

  return null;
}

/** Deriva um nome de projeto/unidade a partir do nome do arquivo. */
export function deriveProjectNameFromFile(filename: string): string {
  return filename
    .replace(/\.(xlsx|xls|xltx|csv)$/i, "")
    .replace(/_/g, " ")
    .trim();
}

/**
 * Importer do RNC (navegador).
 * Migrado de handleRncFiles() + combineAndRenderRnc() do HTML.
 * Usa detecção de cabeçalho e dedup de linha 100% idêntica entre arquivos.
 */

import { readWorkbookMatrix } from "@/importers/shared/workbook-reader";
import { parseWithHeaderDetection } from "@/importers/shared/header-detection";
import { parseFlexDate } from "@/lib/dates";
import { parseBRNumberOrNull } from "@/lib/currency";
import { normalizeRncUnitCode } from "@/features/rnc/utils/units";
import {
  REQUIRED_RNC_COLS,
  type RncNormalizedRecord,
} from "@/features/rnc/types";

export interface RncFileParseResult {
  fileName: string;
  rows: Array<Record<string, unknown>> | null;
  count: number;
  error: string | null;
}

export async function parseRncFile(file: File): Promise<RncFileParseResult> {
  const result: RncFileParseResult = {
    fileName: file.name,
    rows: null,
    count: 0,
    error: null,
  };
  try {
    const matrix = await readWorkbookMatrix(file);
    const rows = parseWithHeaderDetection(matrix, REQUIRED_RNC_COLS);
    if (!rows) {
      result.error =
        "Não encontrei as colunas status_rnc, unidade, data_de_criação, " +
        "data_de_solução, tempo_de_tratativa e ofensor.";
    } else {
      result.rows = rows;
      result.count = rows.length;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Erro ao ler arquivo";
  }
  return result;
}

/** Remove linhas 100% idênticas entre arquivos (fiel a combineAndRenderRnc). */
export function dedupeRncRows(
  allRows: Array<Record<string, unknown>>,
): { rows: Array<Record<string, unknown>>; duplicates: number } {
  if (!allRows.length) return { rows: [], duplicates: 0 };
  const colSet = new Set<string>();
  for (const r of allRows) for (const k of Object.keys(r)) colSet.add(k);
  const keyCols = Array.from(colSet).sort();
  const seen = new Set<string>();
  const finalRows: Array<Record<string, unknown>> = [];
  let duplicates = 0;
  for (const r of allRows) {
    const sig = keyCols
      .map((c) => {
        const v = r[c];
        return v instanceof Date ? String(v.getTime()) : String(v);
      })
      .join("|");
    if (seen.has(sig)) {
      duplicates++;
      continue;
    }
    seen.add(sig);
    finalRows.push(r);
  }
  return { rows: finalRows, duplicates };
}

/** Converte linha normalizada em registro RNC tipado (null se sem data de criação). */
export function toRncRecord(
  row: Record<string, unknown>,
): RncNormalizedRecord | null {
  const dataCriacao = parseFlexDate(row["data_de_criação"]);
  if (!dataCriacao) return null;

  const solRaw = row["data_de_solução"];
  const dataSolucao =
    solRaw === null || solRaw === undefined || solRaw === ""
      ? null
      : parseFlexDate(solRaw);

  const tRaw = row["tempo_de_tratativa"];
  const tempoTratativa =
    tRaw === null ||
    tRaw === undefined ||
    tRaw === "" ||
    String(tRaw).trim().toUpperCase() === "NAN"
      ? null
      : parseBRNumberOrNull(tRaw);

  return {
    statusRnc: String(row["status_rnc"] ?? "").trim(),
    unidade: normalizeRncUnitCode(row["unidade"]),
    dataCriacao,
    dataSolucao,
    tempoTratativa,
    ofensor: String(row["ofensor"] ?? "").trim() || "N/A",
    year: dataCriacao.getFullYear(),
    month: dataCriacao.getMonth() + 1,
    raw: row,
  };
}

export async function importRncFiles(files: File[]): Promise<{
  records: RncNormalizedRecord[];
  perFile: RncFileParseResult[];
  duplicates: number;
}> {
  const perFile: RncFileParseResult[] = [];
  const allRows: Array<Record<string, unknown>> = [];
  for (const file of files) {
    const res = await parseRncFile(file);
    perFile.push(res);
    if (res.rows) allRows.push(...res.rows);
  }
  const { rows, duplicates } = dedupeRncRows(allRows);
  const records = rows
    .map(toRncRecord)
    .filter((r): r is RncNormalizedRecord => r !== null);
  return { records, perFile, duplicates };
}

/**
 * Importer do RDO (navegador).
 * Migrado de handleRdoFiles() + combineAndRenderRdo() do HTML.
 *
 * Fluxo:
 *   1. lê cada arquivo (Excel/CSV) -> linhas brutas
 *   2. normaliza headers
 *   3. valida colunas obrigatórias
 *   4. deduplica linhas 100% idênticas entre arquivos (como no HTML)
 *   5. converte para RdoNormalizedRecord (com data parseada e ano/mês)
 */

import { readWorkbookFile } from "@/importers/shared/workbook-reader";
import { normalizeRows } from "@/lib/normalization";
import { parseFlexDate } from "@/lib/dates";
import { nullIfEmpty } from "@/lib/normalization";
import {
  REQUIRED_RDO_COLS,
  type RdoNormalizedRecord,
} from "@/features/rdo/types";

export interface RdoFileParseResult {
  fileName: string;
  rows: Array<Record<string, unknown>> | null;
  count: number;
  error: string | null;
}

/** Lê um arquivo e valida colunas. Não lança: devolve erro no resultado. */
export async function parseRdoFile(file: File): Promise<RdoFileParseResult> {
  const result: RdoFileParseResult = {
    fileName: file.name,
    rows: null,
    count: 0,
    error: null,
  };
  try {
    const raw = await readWorkbookFile(file);
    const rows = normalizeRows(raw);
    const sampleKeys = rows.length ? Object.keys(rows[0] ?? {}) : [];
    const missing = REQUIRED_RDO_COLS.filter((c) => !sampleKeys.includes(c));
    if (missing.length) {
      result.error = `Faltam colunas: ${missing.join(", ")}`;
    } else {
      result.rows = rows;
      result.count = rows.length;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Erro ao ler arquivo";
  }
  return result;
}

/**
 * Combina linhas de vários arquivos e remove duplicatas 100% idênticas.
 * Migrado de combineAndRenderRdo(): relatorio_id sozinho repete legitimamente,
 * então só uma linha inteira idêntica conta como duplicata real.
 */
export function dedupeRdoRows(
  allRows: Array<Record<string, unknown>>,
): { rows: Array<Record<string, unknown>>; duplicates: number } {
  if (!allRows.length) return { rows: [], duplicates: 0 };
  // Une o conjunto de colunas de TODAS as linhas — assim linhas com colunas
  // extras (ex.: disciplina presente só em algumas) não colidem indevidamente.
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

/** Converte linha normalizada em registro RDO tipado, ou null se sem data/unidade. */
export function toRdoRecord(
  row: Record<string, unknown>,
): RdoNormalizedRecord | null {
  const dataReferencia = parseFlexDate(row["data"]);
  const empresaNome = nullIfEmpty(row["empresa_nome"]);
  if (!dataReferencia || !empresaNome) return null;

  return {
    dataReferencia,
    empresaNome,
    statusDescricao: nullIfEmpty(row["status_descricao"]) ?? "",
    relatorioId: nullIfEmpty(row["relatorio_id"]),
    grupo: nullIfEmpty(row["grupo"]),
    disciplina: nullIfEmpty(row["disciplina"]),
    year: dataReferencia.getFullYear(),
    month: dataReferencia.getMonth() + 1,
    raw: row,
  };
}

/** Pipeline completo: arquivos -> registros tipados + estatística de duplicatas. */
export async function importRdoFiles(
  files: File[],
): Promise<{
  records: RdoNormalizedRecord[];
  perFile: RdoFileParseResult[];
  duplicates: number;
}> {
  const perFile: RdoFileParseResult[] = [];
  const allRows: Array<Record<string, unknown>> = [];
  for (const file of files) {
    const res = await parseRdoFile(file);
    perFile.push(res);
    if (res.rows) allRows.push(...res.rows);
  }
  const { rows, duplicates } = dedupeRdoRows(allRows);
  const records = rows
    .map(toRdoRecord)
    .filter((r): r is RdoNormalizedRecord => r !== null);
  return { records, perFile, duplicates };
}

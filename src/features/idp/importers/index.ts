/**
 * Importer do IDP (navegador).
 * Migrado de handleIdpFiles() + combineAndRenderIdp() do HTML.
 *
 * Diferenças em relação ao RDO:
 *  - As planilhas são exports de MS Project com linhas em branco antes do
 *    cabeçalho, então usamos detecção de cabeçalho sobre a matriz bruta.
 *  - A "unidade" (projeto) vem do NOME DO ARQUIVO, não de uma coluna.
 */

import { readWorkbookMatrix } from "@/importers/shared/workbook-reader";
import {
  parseWithHeaderDetection,
  deriveProjectNameFromFile,
} from "@/importers/shared/header-detection";
import { nullIfEmpty } from "@/lib/normalization";
import { monthIndexPt } from "@/lib/dates";
import { parseBRNumberOrNull } from "@/lib/currency";
import {
  REQUIRED_IDP_COLS,
  type IdpNormalizedRecord,
} from "@/features/idp/types";

export interface IdpFileParseResult {
  fileName: string;
  projectName: string;
  rows: Array<Record<string, unknown>> | null;
  count: number;
  error: string | null;
}

/** Lê um arquivo IDP e valida o cabeçalho. Não lança: erro fica no resultado. */
export async function parseIdpFile(file: File): Promise<IdpFileParseResult> {
  const result: IdpFileParseResult = {
    fileName: file.name,
    projectName: deriveProjectNameFromFile(file.name),
    rows: null,
    count: 0,
    error: null,
  };
  try {
    const matrix = await readWorkbookMatrix(file);
    const rows = parseWithHeaderDetection(matrix, REQUIRED_IDP_COLS);
    if (!rows) {
      result.error =
        "Não encontrei o cabeçalho (Ano, Mês, Disciplina tarefa, " +
        "Custo da Linha de Base, Custo Real).";
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
 * Converte uma linha normalizada em registro IDP tipado, ou null se for uma
 * linha a ignorar (sem ano, "Total Geral", disciplina vazia ou "NULL").
 * `unit` vem do nome do projeto do arquivo.
 */
export function toIdpRecord(
  row: Record<string, unknown>,
  unit: string,
): IdpNormalizedRecord | null {
  const ano = String(row["ano"] ?? "").trim();
  const disc = String(row["disciplina_tarefa"] ?? "").trim();
  if (!ano || ano.toLowerCase() === "total geral") return null;
  if (!disc || disc.toUpperCase() === "NULL") return null;

  const month = monthIndexPt(row["mês"]);
  if (month === 0) return null;

  const year = parseInt(ano, 10);
  if (isNaN(year)) return null;

  return {
    unit,
    year,
    month,
    disciplina: disc,
    custoLinhaBase: parseBRNumberOrNull(row["custo_da_linha_de_base"]) ?? 0,
    custoReal: parseBRNumberOrNull(row["custo_real"]) ?? 0,
    raw: { ...row, __unit: unit },
  };
}


/** Converte um arquivo já analisado em registros, permitindo ajustar o nome da unidade antes do envio. */
export function recordsFromParsedIdpFile(
  parsed: IdpFileParseResult,
  projectName: string = parsed.projectName,
): IdpNormalizedRecord[] {
  if (!parsed.rows) return [];
  const unit = projectName.trim() || parsed.projectName;
  const records: IdpNormalizedRecord[] = [];
  for (const row of parsed.rows) {
    const record = toIdpRecord(row, unit);
    if (record) records.push(record);
  }
  return records;
}

/** Pipeline completo: arquivos -> registros IDP tipados. */
export async function importIdpFiles(files: File[]): Promise<{
  records: IdpNormalizedRecord[];
  perFile: IdpFileParseResult[];
}> {
  const perFile: IdpFileParseResult[] = [];
  const records: IdpNormalizedRecord[] = [];

  for (const file of files) {
    const res = await parseIdpFile(file);
    perFile.push(res);
    if (!res.rows) continue;
    records.push(...recordsFromParsedIdpFile(res));
  }

  return { records, perFile };
}

// nullIfEmpty é reexportado por conveniência de quem monta linhas cruas.
export { nullIfEmpty };

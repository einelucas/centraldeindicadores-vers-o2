/**
 * Exportação genérica para Excel (client-side).
 * Recebe colunas + linhas e dispara o download de um .xlsx.
 */

import * as XLSX from "xlsx";

export interface ExportColumn<T> {
  header: string;
  /** Valor da célula para a linha. */
  value: (row: T) => string | number | null;
}

/** Monta uma matriz (cabeçalho + linhas) a partir de colunas tipadas. */
export function toAoa<T>(
  columns: Array<ExportColumn<T>>,
  rows: readonly T[],
): (string | number | null)[][] {
  const header = columns.map((c) => c.header);
  const body = rows.map((r) => columns.map((c) => c.value(r)));
  return [header, ...body];
}

/**
 * Exporta linhas para um arquivo Excel e dispara o download.
 * @param sheetName nome da aba (padrão "Dados")
 */
export function exportToExcel<T>(
  fileName: string,
  columns: Array<ExportColumn<T>>,
  rows: readonly T[],
  sheetName = "Dados",
): void {
  const aoa = toAoa(columns, rows);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

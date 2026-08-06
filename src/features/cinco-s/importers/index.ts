/**
 * Importer do 5S (navegador).
 * Cada aba do arquivo é uma unidade e a data de auditoria fica ao lado de
 * "Meta". As colunas são posicionais: Divisão | Área | Meta | Nota.
 */

import * as XLSX from "xlsx";
import type {
  FiveSArea,
  FiveSNormalizedRecord,
} from "@/features/cinco-s/types";
import { normalizeFiveSUnitCode } from "@/features/cinco-s/utils/units";

export interface FiveSFileParseResult {
  fileName: string;
  records: FiveSNormalizedRecord[];
  error: string | null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text
    .replace(/%/g, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseAuditDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parts = XLSX.SSF.parse_date_code(value);
    if (parts) return new Date(parts.y, parts.m - 1, parts.d);
  }
  const text = String(value ?? "").trim();
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

/** Parseia uma aba do 5S. */
export function parseFsWorkbookMatrix(
  sheet: XLSX.WorkSheet,
): { auditDate: Date; areas: FiveSArea[] } | null {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  let headerRow = -1;
  let auditDate: Date | null = null;
  let metaCol = -1;

  for (let rowIndex = 0; rowIndex < Math.min(matrix.length, 15); rowIndex++) {
    const row = (matrix[rowIndex] ?? []) as unknown[];
    for (let column = 0; column < row.length; column++) {
      if (String(row[column] ?? "").trim().toLowerCase() !== "meta") continue;
      const parsedDate = parseAuditDate(row[column + 1]);
      if (!parsedDate) continue;
      headerRow = rowIndex;
      auditDate = parsedDate;
      metaCol = column;
      break;
    }
    if (headerRow !== -1) break;
  }
  if (headerRow === -1 || !auditDate) return null;

  const divisaoCol = metaCol - 2;
  const areaCol = metaCol - 1;
  const notaCol = metaCol + 1;
  const areas: FiveSArea[] = [];
  let currentDivisao: string | null = null;

  for (let rowIndex = headerRow + 1; rowIndex < matrix.length; rowIndex++) {
    const row = (matrix[rowIndex] ?? []) as unknown[];
    const divisaoCell = row[divisaoCol];
    const areaCell = row[areaCol];

    if (String(divisaoCell ?? "").trim()) {
      currentDivisao = String(divisaoCell).trim();
    }
    const area = String(areaCell ?? "").trim();
    if (!area || /^média divisão/i.test(area)) continue;

    const meta = parseNumber(row[metaCol]);
    const nota = parseNumber(row[notaCol]);
    if (meta === null || nota === null) continue;

    areas.push({ divisao: currentDivisao, area, meta, nota });
  }

  return areas.length ? { auditDate, areas } : null;
}

/** Lê um arquivo 5S: cada aba válida vira uma unidade num mês. */
export async function parseFiveSFile(file: File): Promise<FiveSFileParseResult> {
  const result: FiveSFileParseResult = {
    fileName: file.name,
    records: [],
    error: null,
  };
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const parsed = parseFsWorkbookMatrix(sheet);
      if (!parsed) continue;
      result.records.push({
        unit: normalizeFiveSUnitCode(sheetName),
        year: parsed.auditDate.getFullYear(),
        month: parsed.auditDate.getMonth() + 1,
        areas: parsed.areas,
        raw: { fileName: file.name, sheet: sheetName },
      });
    }
    if (!result.records.length) {
      result.error =
        'Não encontrei nenhuma aba com o padrão "Meta" + data + Divisão/Área/Nota.';
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Erro ao ler arquivo";
  }
  return result;
}

export async function importFiveSFiles(files: File[]): Promise<{
  records: FiveSNormalizedRecord[];
  perFile: FiveSFileParseResult[];
  duplicates: number;
}> {
  const perFile: FiveSFileParseResult[] = [];
  const byKey = new Map<string, FiveSNormalizedRecord>();
  let duplicates = 0;

  for (const file of files) {
    const parsed = await parseFiveSFile(file);
    perFile.push(parsed);
    for (const record of parsed.records) {
      const key = `${normalizeFiveSUnitCode(record.unit)}|||${record.year}-${record.month}`;
      if (byKey.has(key)) duplicates++;
      byKey.set(key, record);
    }
  }

  return { records: Array.from(byKey.values()), perFile, duplicates };
}

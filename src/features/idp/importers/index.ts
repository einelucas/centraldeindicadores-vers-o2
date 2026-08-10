/** Leitor dos PDFs RSO executado no navegador. */

import {
  IDP_DISC_NAMES,
  type IdpNormalizedRecord,
  type IdpRsoDisciplineData,
} from "@/features/idp/types";

const PDF_JS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDF_WORKER_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

interface PdfTextItem {
  str: string;
  transform: number[];
}

interface PdfJsDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: PdfTextItem[] }>;
  }>;
}

interface PdfJsLibrary {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(input: { data: ArrayBuffer }): { promise: Promise<PdfJsDocument> };
}

declare global {
  interface Window {
    pdfjsLib?: PdfJsLibrary;
  }
}

let pdfJsPromise: Promise<PdfJsLibrary> | null = null;
let pdfWorkerPromise: Promise<void> | null = null;

export interface IdpFileParseResult {
  fileName: string;
  record: IdpNormalizedRecord | null;
  error: string | null;
}

export interface RsoReferenceMetadata {
  referenceYear: number | null;
  referenceMonth: number | null;
  originalText: string | null;
}

export interface RsoPeriodMetadata {
  periodStart: string | null;
  periodEnd: string | null;
  emissionDate: string | null;
}

async function configurePdfWorker(pdfjs: PdfJsLibrary): Promise<void> {
  if (!pdfWorkerPromise) {
    pdfWorkerPromise = fetch(PDF_WORKER_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Falha ao carregar o worker PDF: ${response.status}`);
        return response.text();
      })
      .then((code) => {
        const blob = new Blob([code], { type: "application/javascript" });
        pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
      })
      .catch(() => {
        pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      });
  }
  await pdfWorkerPromise;
}

function loadPdfJs(): Promise<PdfJsLibrary> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("O leitor RSO só pode ser executado no navegador."));
  }
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
    return Promise.resolve(window.pdfjsLib);
  }
  if (pdfJsPromise) return pdfJsPromise;

  pdfJsPromise = new Promise<PdfJsLibrary>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PDF_JS_URL}"]`);
    const script = existing ?? document.createElement("script");

    const finish = () => {
      if (!window.pdfjsLib) {
        reject(new Error("A biblioteca PDF.js foi carregada, mas não ficou disponível."));
        return;
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
      resolve(window.pdfjsLib);
    };

    script.addEventListener("load", finish, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Não foi possível carregar o leitor de PDF do RSO.")),
      { once: true },
    );

    if (!existing) {
      script.src = PDF_JS_URL;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    } else if (window.pdfjsLib) {
      finish();
    }
  });

  return pdfJsPromise;
}

interface PositionedText {
  text: string;
  x: number;
  y: number;
}

export function groupPdfRows(items: PositionedText[]) {
  const rows: Array<{ y: number; items: PositionedText[] }> = [];

  for (const item of items) {
    let bucket = rows.find((row) => Math.abs(row.y - item.y) <= 2.5);
    if (!bucket) {
      bucket = { y: item.y, items: [] };
      rows.push(bucket);
    }
    bucket.items.push(item);
  }

  for (const row of rows) row.items.sort((a, b) => a.x - b.x);
  rows.sort((a, b) => b.y - a.y);
  return rows;
}

export function parseDisciplineLine(text: string, disciplineName: string) {
  const escaped = disciplineName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `${escaped}\\s+([\\d.,]+)%\\s+([\\d.,]+)%\\s+[+-]?[\\d.,]+%`,
    "i",
  );
  const match = text.match(pattern);
  if (!match) return null;

  const number = (value: string) => Number.parseFloat(value.replace(",", "."));
  return { prevAcum: number(match[1]!), realAcum: number(match[2]!) };
}

function normalizeText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function isoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeYear(value: number): number {
  return value < 100 ? 2000 + value : value;
}

function normalizedMonthName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

const RSO_MONTH_NAMES = new Map<string, number>([
  ["janeiro", 1], ["jan", 1],
  ["fevereiro", 2], ["fev", 2],
  ["marco", 3], ["mar", 3],
  ["abril", 4], ["abr", 4],
  ["maio", 5], ["mai", 5],
  ["junho", 6], ["jun", 6],
  ["julho", 7], ["jul", 7],
  ["agosto", 8], ["ago", 8],
  ["setembro", 9], ["set", 9],
  ["outubro", 10], ["out", 10],
  ["novembro", 11], ["nov", 11],
  ["dezembro", 12], ["dez", 12],
]);

/**
 * Lê SOMENTE o campo explícito "Mês ref.". Não usa período, emissão ou data
 * atual como fallback: se o RSO não declarar a competência, ela fica pendente
 * para confirmação manual antes da importação.
 */
export function parseRsoReferenceMetadata(text: string): RsoReferenceMetadata {
  const normalized = normalizeText(text);

  const full = normalized.match(
    /m[eê]s\s*ref\.?\s*:\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/i,
  );
  if (full) {
    const month = Number(full[2]);
    const year = normalizeYear(Number(full[3]));
    if (isoDate(year, month, 1)) {
      return {
        referenceYear: year,
        referenceMonth: month,
        originalText: full[0] ?? null,
      };
    }
  }

  const numeric = normalized.match(
    /m[eê]s\s*ref\.?\s*:\s*(\d{1,2})[./-](\d{2,4})/i,
  );
  if (numeric) {
    const month = Number(numeric[1]);
    const year = normalizeYear(Number(numeric[2]));
    if (isoDate(year, month, 1)) {
      return {
        referenceYear: year,
        referenceMonth: month,
        originalText: numeric[0] ?? null,
      };
    }
  }

  const named = normalized.match(
    /m[eê]s\s*ref\.?\s*:\s*([a-záàâãéêíóôõúç]{3,12})(?:\s+de)?\s*[./-]?\s*(\d{2,4})/i,
  );
  if (named) {
    const month = RSO_MONTH_NAMES.get(normalizedMonthName(named[1]!)) ?? null;
    const year = normalizeYear(Number(named[2]));
    if (month && isoDate(year, month, 1)) {
      return {
        referenceYear: year,
        referenceMonth: month,
        originalText: named[0] ?? null,
      };
    }
  }

  return { referenceYear: null, referenceMonth: null, originalText: null };
}

/** Compatibilidade com testes/integrações anteriores: retorna YYYY-MM-01 ou null. */
export function parseRsoReferenceDate(text: string): string | null {
  const parsed = parseRsoReferenceMetadata(text);
  if (!parsed.referenceYear || !parsed.referenceMonth) return null;
  return isoDate(parsed.referenceYear, parsed.referenceMonth, 1);
}

function parseDateMatch(match: RegExpMatchArray | null, startIndex = 1): string | null {
  if (!match) return null;
  return isoDate(
    normalizeYear(Number(match[startIndex + 2])),
    Number(match[startIndex + 1]),
    Number(match[startIndex]),
  );
}

export function parseRsoPeriodMetadata(text: string): RsoPeriodMetadata {
  const normalized = normalizeText(text);
  const period = normalized.match(
    /per[ií]odo\s*:\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s*(?:[–—-]|a|até)\s*|\s+)(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/i,
  );
  const emission = normalized.match(
    /emiss[aã]o\s*:\s*(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/i,
  );

  return {
    periodStart: parseDateMatch(period, 1),
    periodEnd: parseDateMatch(period, 4),
    emissionDate: parseDateMatch(emission, 1),
  };
}

/** Identifica o título da área sem cortar códigos compostos como 1702.B/1702.E. */
export function parseRsoAreaName(text: string, pageNumber: number): string {
  const match = text.match(
    /\b(\d{3,4}(?:\.[A-Za-z0-9]*)?(?:\s*\/\s*\d{3,4}(?:\.[A-Za-z0-9]*)?)?\s*[—–-]\s*[^\n]+)/,
  );
  return match?.[1]?.trim() || `Página ${pageNumber}`;
}

export function executionPhasesFromFirstPage(text: string) {
  const phases: Array<{ label: string; prevAcum: number; realAcum: number }> = [];
  let currentPhase: string | null = null;

  for (const rawLine of normalizeText(text).split("\n")) {
    const line = rawLine.trim();
    const phaseMatch = line.match(/(?:Implanta[cç][aã]o|Amplia[cç][aã]o)\s+Fase\s+([A-Za-z0-9./-]+)/i);
    if (phaseMatch) currentPhase = `Fase ${phaseMatch[1]}`;

    const execution = line.match(
      /^Execu[cç][aã]o\s+[\d.,]+%\s+[\d.,]+%\s+[+-]?[\d.,]+%\s+([\d.,]+)%\s+([\d.,]+)%/i,
    );
    if (!execution) continue;

    phases.push({
      label: currentPhase ?? `Fase ${phases.length + 1}`,
      prevAcum: Number.parseFloat(execution[1]!.replace(",", ".")),
      realAcum: Number.parseFloat(execution[2]!.replace(",", ".")),
    });
  }

  return phases;
}

export async function parseRsoPdf(file: File): Promise<IdpNormalizedRecord> {
  if (!/\.pdf$/i.test(file.name)) {
    throw new Error("O RSO deve ser enviado em formato PDF.");
  }

  const pdfjs = await loadPdfJs();
  await configurePdfWorker(pdfjs);
  const buffer = await file.arrayBuffer();
  const documentPdf = await pdfjs.getDocument({ data: buffer }).promise;
  const areas: string[] = [];
  const discData: IdpRsoDisciplineData = Object.fromEntries(
    IDP_DISC_NAMES.map((name) => [name, []]),
  );
  let execucaoFases: Array<{ label: string; prevAcum: number; realAcum: number }> = [];
  let unit: string | null = null;
  let rsoNumero: number | null = null;
  let reference = { referenceYear: null, referenceMonth: null, originalText: null } as RsoReferenceMetadata;
  let period: RsoPeriodMetadata = { periodStart: null, periodEnd: null, emissionDate: null };
  let firstPageText = "";

  for (let pageNumber = 1; pageNumber <= documentPdf.numPages; pageNumber += 1) {
    const page = await documentPdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .map((item) => ({
        text: item.str,
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
      }))
      .filter((item) => item.text.trim() !== "");

    const rows = groupPdfRows(items);
    const text = normalizeText(
      rows.map((row) => row.items.map((item) => item.text).join(" ")).join("\n"),
    );

    if (pageNumber === 1) {
      firstPageText = text;
      const unitMatch = text.match(/Unidade:\s*([^\n]+?)(?:\s+Projeto:|\n|$)/i);
      if (unitMatch) unit = unitMatch[1]!.trim();

      const rsoMatch = text.match(/RSO\s*N[º°o]?\s*:\s*(\d+)/i);
      if (rsoMatch) rsoNumero = Number.parseInt(rsoMatch[1]!, 10);

      reference = parseRsoReferenceMetadata(text);
      period = parseRsoPeriodMetadata(text);
      execucaoFases = executionPhasesFromFirstPage(text);
    }

    if (text.includes("Disciplinas") && /DISCIPLINA\s+PREV/i.test(text)) {
      const areaName = parseRsoAreaName(text, pageNumber);
      areas.push(areaName);

      for (const discipline of IDP_DISC_NAMES) {
        const parsed = parseDisciplineLine(text, discipline);
        if (parsed) discData[discipline]!.push({ area: areaName, ...parsed });
      }
    }
  }

  if (!unit) {
    throw new Error(
      'Não encontrei "Unidade:" na primeira página. O PDF não parece seguir o padrão esperado do RSO.',
    );
  }

  return {
    unit,
    detectedUnit: unit,
    unitAdjusted: false,
    rsoNumero,
    detectedRsoNumero: rsoNumero,
    rsoAdjusted: false,
    referenceYear: reference.referenceYear,
    referenceMonth: reference.referenceMonth,
    detectedReferenceYear: reference.referenceYear,
    detectedReferenceMonth: reference.referenceMonth,
    referenceSource: reference.referenceYear && reference.referenceMonth ? "PDF_MES_REF" : "UNRESOLVED",
    referenceOriginalText: reference.originalText,
    referenceAdjusted: false,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    emissionDate: period.emissionDate,
    fileName: file.name,
    areas,
    discData,
    execucaoFases,
    raw: {
      source: "RSO_PDF",
      fileName: file.name,
      pages: documentPdf.numPages,
      parsedAt: new Date().toISOString(),
      firstPageHeader: firstPageText.slice(0, 3000),
      referenceOriginalText: reference.originalText,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      emissionDate: period.emissionDate,
    },
  };
}

/** Lê um PDF RSO e não lança: o erro fica no resultado. */
export async function parseIdpFile(file: File): Promise<IdpFileParseResult> {
  try {
    return { fileName: file.name, record: await parseRsoPdf(file), error: null };
  } catch (error) {
    return {
      fileName: file.name,
      record: null,
      error: error instanceof Error ? error.message : "Erro ao ler o RSO.",
    };
  }
}

export async function importIdpFiles(files: File[]): Promise<{
  records: IdpNormalizedRecord[];
  perFile: IdpFileParseResult[];
}> {
  const perFile: IdpFileParseResult[] = [];
  const records: IdpNormalizedRecord[] = [];

  for (const file of files) {
    const result = await parseIdpFile(file);
    perFile.push(result);
    if (result.record) records.push(result.record);
  }

  return { records, perFile };
}

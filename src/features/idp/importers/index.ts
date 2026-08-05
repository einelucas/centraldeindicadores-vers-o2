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
        // Fallback preservado do HTML base. Em alguns navegadores o worker
        // remoto funciona diretamente; em outros, o Blob evita bloqueio CORS.
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
  return text.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ");
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
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

/** Tenta localizar a competência/data do relatório na primeira página. */
export function parseRsoReferenceDate(text: string, fallback: Date = new Date()): string {
  const normalized = normalizeText(text);
  const labelledPatterns = [
    /(?:data\s+(?:de\s+)?(?:refer[eê]ncia|emiss[aã]o|medi[cç][aã]o|atualiza[cç][aã]o)|compet[eê]ncia|data\s*base|per[ií]odo\s+de\s+refer[eê]ncia)\s*:?\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i,
    /(?:refer[eê]ncia|compet[eê]ncia)\s*:?\s*(\d{1,2})[./-](\d{4})/i,
  ];

  for (const pattern of labelledPatterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    if (match.length >= 4) {
      const parsed = isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
      if (parsed) return parsed;
    } else {
      const parsed = isoDate(Number(match[2]), Number(match[1]), 1);
      if (parsed) return parsed;
    }
  }

  return `${fallback.getFullYear().toString().padStart(4, "0")}-${(fallback.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${fallback.getDate().toString().padStart(2, "0")}`;
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
  const execucaoFases: Array<{ prevAcum: number; realAcum: number }> = [];
  let unit: string | null = null;
  let rsoNumero: number | null = null;
  let referenceDate = new Date().toISOString().slice(0, 10);

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
      const unitMatch = text.match(/Unidade:\s*([^\n]+?)(?:\s+Projeto:|\n|$)/i);
      if (unitMatch) unit = unitMatch[1]!.trim();

      const rsoMatch = text.match(/RSO\s*N[º°o]?\s*:\s*(\d+)/i);
      if (rsoMatch) rsoNumero = Number.parseInt(rsoMatch[1]!, 10);

      referenceDate = parseRsoReferenceDate(text);

      const phasePattern =
        /Execução\s+[\d.,]+%\s+[\d.,]+%\s+[+-]?[\d.,]+%\s+([\d.,]+)%\s+([\d.,]+)%/gi;
      let phaseMatch: RegExpExecArray | null;
      while ((phaseMatch = phasePattern.exec(text)) !== null) {
        execucaoFases.push({
          prevAcum: Number.parseFloat(phaseMatch[1]!.replace(",", ".")),
          realAcum: Number.parseFloat(phaseMatch[2]!.replace(",", ".")),
        });
      }
    }

    if (text.includes("Disciplinas") && /DISCIPLINA\s+PREV/i.test(text)) {
      const areaMatch = text.match(/(\d{3,4}(?:\.\w+)?\s*[—–-]\s*[^\n]+)/);
      const areaName = areaMatch ? areaMatch[1]!.trim() : `Página ${pageNumber}`;
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
    rsoNumero,
    referenceDate,
    fileName: file.name,
    areas,
    discData,
    execucaoFases,
    raw: {
      source: "RSO_PDF",
      fileName: file.name,
      pages: documentPdf.numPages,
      parsedAt: new Date().toISOString(),
      referenceDate,
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

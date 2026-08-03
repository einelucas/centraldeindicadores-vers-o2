/**
 * Exportação genérica para PDF (client-side) usando jspdf + autotable.
 * Gera um documento com título, subtítulo opcional e uma tabela.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ExportColumn } from "@/lib/exports/excel";

export interface PdfExportOptions {
  title: string;
  subtitle?: string;
  /** Orientação da página (padrão retrato). */
  orientation?: "portrait" | "landscape";
}

const BRAND: [number, number, number] = [48, 79, 126]; // #304F7E

/**
 * Exporta linhas para um PDF com tabela e dispara o download.
 */
export function exportToPdf<T>(
  fileName: string,
  columns: Array<ExportColumn<T>>,
  rows: readonly T[],
  options: PdfExportOptions,
): void {
  const doc = new jsPDF({
    orientation: options.orientation ?? "portrait",
    unit: "pt",
  });

  doc.setFontSize(16);
  doc.setTextColor(...BRAND);
  doc.text(options.title, 40, 40);

  let startY = 60;
  if (options.subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(options.subtitle, 40, 56);
    startY = 74;
  }

  autoTable(doc, {
    startY,
    head: [columns.map((c) => c.header)],
    body: rows.map((r) =>
      columns.map((c) => {
        const v = c.value(r);
        return v === null || v === undefined ? "" : String(v);
      }),
    ),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: BRAND, textColor: 255 },
    alternateRowStyles: { fillColor: [244, 245, 247] }, // #F4F5F7
  });

  doc.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}

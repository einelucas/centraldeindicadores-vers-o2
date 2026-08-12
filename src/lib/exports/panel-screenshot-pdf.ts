/**
 * Exportação de painel publicado para PDF via "print" do container (client-side).
 * Tira uma captura do node inteiro com html2canvas e embute como imagem única
 * num PDF do mesmo tamanho — usado pelos painéis publicados (RNC, RDO, ...).
 */

import { useCallback, useState, type RefObject } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

export async function exportPanelScreenshotToPdf(
  node: HTMLElement,
  fileName: string,
  backgroundColor = "#eff2f7",
): Promise<void> {
  const canvas = await html2canvas(node, {
    backgroundColor,
    scale: 2,
    useCORS: true,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({
    orientation: canvas.width >= canvas.height ? "landscape" : "portrait",
    unit: "px",
    format: [canvas.width, canvas.height],
  });

  pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(fileName);
}

/** Estado (exporting/error) + disparo da exportação acima, pronto para um botão. */
export function usePanelPdfExport(ref: RefObject<HTMLElement | null>) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportPdf = useCallback(
    async (fileName: string) => {
      if (!ref.current) return;
      setExporting(true);
      setError(null);
      try {
        await exportPanelScreenshotToPdf(ref.current, fileName);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao gerar o PDF do painel.");
      } finally {
        setExporting(false);
      }
    },
    [ref],
  );

  return { exporting, error, exportPdf };
}

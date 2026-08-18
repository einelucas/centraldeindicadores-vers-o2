import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { FiveSResult } from "@/features/cinco-s/types";
import {
  compareFiveSUnits,
  formatFiveSUnitLabel,
} from "@/features/cinco-s/utils/units";

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

/**
 * `doc`: quando informado, desenha nessa página atual em vez de criar um PDF
 * novo, e não salva o arquivo — usado pelo PDF consolidado do Scorecard para
 * empilhar o 5S como mais uma seção do mesmo arquivo. Sem `doc`, comporta-se
 * exatamente como antes (cria e salva o PDF isolado do 5S).
 */
export function exportFiveSPdf(result: FiveSResult, doc?: jsPDF): void {
  const pdf = doc ?? new jsPDF({ unit: "pt", format: "a4" });
  const today = new Date().toLocaleDateString("pt-BR");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(48, 79, 126);
  pdf.text("5S — Aderência por Unidade", 40, 44);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(110, 110, 110);
  pdf.text(
    `Gerado em ${today} · meta global: ${(result.threshold * 100).toFixed(0)}% · excluídas do GERAL: ${result.excludedUnits.map(formatFiveSUnitLabel).join(", ") || "nenhuma"}`,
    40,
    60,
  );

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(33, 55, 88);
  pdf.text(`GERAL (${result.periodLabel}): ${pct(result.geral)}`, 40, 82);

  const monthKeys = result.months.map((month) => `${month.year}-${month.month}`);
  const units = Array.from(
    new Set(result.unitMonths.map((item) => item.unit)),
  ).sort(compareFiveSUnits);

  autoTable(pdf, {
    startY: 96,
    head: [["Unidade", ...result.months.map((month) => month.label)]],
    body: [
      ...units.map((unit) => [
        `${formatFiveSUnitLabel(unit)}${result.excludedUnits.includes(unit) ? " (excluída)" : ""}`,
        ...monthKeys.map((key) => {
          const [year, month] = key.split("-").map(Number);
          const item = result.unitMonths.find(
            (row) => row.unit === unit && row.year === year && row.month === month,
          );
          return item ? pct(item.aderencia) : "—";
        }),
      ]),
      ["GERAL", ...result.months.map((month) => pct(month.geral))],
    ],
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4 },
    theme: "grid",
  });

  if (!doc) pdf.save(`5S_${new Date().toISOString().slice(0, 10)}.pdf`);
}

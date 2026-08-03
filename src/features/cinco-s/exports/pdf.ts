import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { FiveSResult } from "@/features/cinco-s/types";

function pct(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

export function exportFiveSPdf(result: FiveSResult): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const today = new Date().toLocaleDateString("pt-BR");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(48, 79, 126);
  doc.text("5S — Aderência por Unidade", 40, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `Gerado em ${today} · meta global: ${(result.threshold * 100).toFixed(0)}% · excluídas do GERAL: ${result.excludedUnits.join(", ") || "nenhuma"}`,
    40,
    60,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(33, 55, 88);
  doc.text(`GERAL (${result.periodLabel}): ${pct(result.geral)}`, 40, 82);

  const monthKeys = result.months.map((month) => `${month.year}-${month.month}`);
  const units = Array.from(new Set(result.unitMonths.map((item) => item.unit))).sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );

  autoTable(doc, {
    startY: 96,
    head: [["Unidade", ...result.months.map((month) => month.label)]],
    body: [
      ...units.map((unit) => [
        `${unit}${result.excludedUnits.includes(unit.toUpperCase()) ? " (excluída)" : ""}`,
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

  doc.save(`5S_${new Date().toISOString().slice(0, 10)}.pdf`);
}

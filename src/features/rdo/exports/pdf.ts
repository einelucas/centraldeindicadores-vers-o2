import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { RdoResult } from "@/features/rdo/types";
import { formatRdoUnitLabel } from "@/features/rdo/utils/units";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function exportRdoPdf(result: RdoResult, thresholdPercent: number): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const today = new Date().toLocaleDateString("pt-BR");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(48, 79, 126);
  doc.text("RDO — Aprovação de Relatórios", 40, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Gerado em ${today} · meta de aderência: ${thresholdPercent.toFixed(0)}%`, 40, 60);

  const cardData = [
    ["TOTAL EMITIDOS", result.totalEmitidos.toLocaleString("pt-BR")],
    ["APROVADOS", pct(result.totalEmitidos ? result.totalAprovados / result.totalEmitidos : 0)],
    ["A REVISAR", pct(result.totalEmitidos ? result.totalRevisar / result.totalEmitidos : 0)],
    ["PREENCHENDO", pct(result.totalEmitidos ? result.totalPreenchendo / result.totalEmitidos : 0)],
  ];
  const cardY = 78;
  const cardH = 56;
  const gap = 12;
  const cardW = (515 - gap * 3) / 4;
  cardData.forEach(([label, value], index) => {
    const x = 40 + index * (cardW + gap);
    doc.setDrawColor(228, 230, 234);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cardY, cardW, cardH, 5, 5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text(label ?? "", x + 10, cardY + 18);
    doc.setFontSize(16);
    doc.setTextColor(index === 1 ? 234 : 33, index === 1 ? 162 : 55, index === 1 ? 57 : 88);
    doc.text(value ?? "", x + 10, cardY + 38);
  });

  autoTable(doc, {
    startY: cardY + cardH + 20,
    head: [["Unidade", "Emitidos", "Aprovados", "Aderência", "Situação"]],
    body: result.units.map((unit) => [
      formatRdoUnitLabel(unit.name),
      unit.emitidos,
      unit.aprovados,
      pct(unit.aderencia),
      unit.aderencia >= thresholdPercent / 100 ? "Dentro da meta" : "Abaixo da meta",
    ]),
    foot: [["Média", "", "", pct(result.unitAvg), ""]],
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [238, 241, 246], textColor: [33, 55, 88], fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
    theme: "grid",
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 430;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(48, 79, 126);
  doc.text("Aderência por mês", 40, finalY + 24);

  autoTable(doc, {
    startY: finalY + 34,
    head: [["Mês", "Emitidos", "Aprovados", "Aderência", "Situação"]],
    body: result.months.map((month) => [
      month.label,
      month.emitidos,
      month.aprovados,
      pct(month.aderencia),
      month.aderencia >= thresholdPercent / 100 ? "Dentro da meta" : "Abaixo da meta",
    ]),
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
    theme: "grid",
  });

  doc.save(`RDO_indicadores_${new Date().toISOString().slice(0, 10)}.pdf`);
}

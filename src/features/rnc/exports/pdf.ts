import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { RncResult } from "@/features/rnc/types";
import { formatRncUnitLabel } from "@/features/rnc/utils/units";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function days(value: number | null): string {
  return value === null ? "—" : String(Math.round(value));
}

export function exportRncPdf(result: RncResult): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const today = new Date().toLocaleDateString("pt-BR");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(48, 79, 126);
  doc.text("RNC — Não Conformidades", 40, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Gerado em ${today} · meta: ≤ ${result.metaDias} dias`, 40, 60);

  const cards = [
    ["RNC'S CRIADAS", result.totalCriadas.toLocaleString("pt-BR")],
    ["RNC'S TRATADAS", result.totalTratadas.toLocaleString("pt-BR")],
    ["ADERÊNCIA", pct(result.aderenciaTotal)],
    ["RESULTADO", result.resultadoDias === null ? "—" : `${days(result.resultadoDias)} dias`],
  ];
  const cardY = 78;
  const cardH = 50;
  const gap = 10;
  const cardW = (515 - gap * 3) / 4;
  cards.forEach(([label, value], index) => {
    const x = 40 + index * (cardW + gap);
    doc.setDrawColor(228, 230, 234);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cardY, cardW, cardH, 5, 5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(107, 114, 128);
    doc.text(label ?? "", x + 9, cardY + 17);
    doc.setFontSize(13);
    doc.setTextColor(index >= 2 ? 234 : 33, index >= 2 ? 162 : 55, index >= 2 ? 57 : 88);
    doc.text(value ?? "", x + 9, cardY + 36);
  });

  autoTable(doc, {
    startY: cardY + cardH + 18,
    head: [["Mês", "RNC Elaboradas", "RNC Tratadas", "Dias de resolução", "Situação"]],
    body: result.months.map((month) => [
      month.label,
      month.chamados,
      month.solucionados,
      days(month.diasMedios),
      month.diasMedios === null
        ? "Sem tratativa"
        : month.dentroMeta
          ? "Dentro da meta"
          : "Fora da meta",
    ]),
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4 },
    theme: "grid",
  });

  const firstY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 350;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(48, 79, 126);
  doc.text("Aderência por unidade", 40, firstY + 22);

  autoTable(doc, {
    startY: firstY + 30,
    head: [["Unidade", "Criadas", "Tratadas", "Aderência"]],
    body: result.units.map((unit) => [
      formatRncUnitLabel(unit.name),
      unit.criadas,
      unit.tratadas,
      pct(unit.aderencia),
    ]),
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4 },
    theme: "grid",
  });

  const secondY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 520;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(48, 79, 126);
  doc.text("Ofensores", 40, secondY + 22);

  autoTable(doc, {
    startY: secondY + 30,
    head: [["Ofensor", "Quantidade", "%"]],
    body: result.ofensores.map((offender) => [
      offender.name,
      offender.count,
      pct(offender.pct),
    ]),
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4 },
    theme: "grid",
  });

  doc.save(`RNC_${new Date().toISOString().slice(0, 10)}.pdf`);
}

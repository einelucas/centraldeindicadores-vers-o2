import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { RdoResult } from "@/features/rdo/types";
import { formatRdoUnitLabel } from "@/features/rdo/utils/units";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * `doc`: quando informado, desenha nessa página atual em vez de criar um PDF
 * novo, e não salva o arquivo — usado pelo PDF consolidado do Scorecard para
 * empilhar o RDO como mais uma seção do mesmo arquivo. Sem `doc`, comporta-se
 * exatamente como antes (cria e salva o PDF isolado do RDO).
 */
export function exportRdoPdf(result: RdoResult, thresholdPercent: number, doc?: jsPDF): void {
  const pdf = doc ?? new jsPDF({ unit: "pt", format: "a4" });
  const today = new Date().toLocaleDateString("pt-BR");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(48, 79, 126);
  pdf.text("RDO — Aprovação de Relatórios", 40, 44);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(110, 110, 110);
  pdf.text(`Gerado em ${today} · meta de aderência: ${thresholdPercent.toFixed(0)}%`, 40, 60);

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
    pdf.setDrawColor(228, 230, 234);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(x, cardY, cardW, cardH, 5, 5, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.setTextColor(107, 114, 128);
    pdf.text(label ?? "", x + 10, cardY + 18);
    pdf.setFontSize(16);
    pdf.setTextColor(index === 1 ? 234 : 33, index === 1 ? 162 : 55, index === 1 ? 57 : 88);
    pdf.text(value ?? "", x + 10, cardY + 38);
  });

  autoTable(pdf, {
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

  const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 430;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(48, 79, 126);
  pdf.text("Aderência por mês", 40, finalY + 24);

  autoTable(pdf, {
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

  if (!doc) pdf.save(`RDO_indicadores_${new Date().toISOString().slice(0, 10)}.pdf`);
}

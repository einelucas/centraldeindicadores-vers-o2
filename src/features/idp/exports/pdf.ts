import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { IdpDetailedResult } from "@/features/idp/types";
import { MONTH_NAMES_FULL } from "@/lib/dates";
import { fmtCurrency } from "@/lib/currency";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function exportIdpPdf(result: IdpDetailedResult): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const today = new Date().toLocaleDateString("pt-BR");
  const target = result.threshold * 100;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(48, 79, 126);
  doc.text("IDP - Disciplinas", 40, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `Gerado em ${today} · período: ${MONTH_NAMES_FULL[result.monthStart - 1]} a ${MONTH_NAMES_FULL[result.monthEnd - 1]}/${result.selectedYear} · meta: ${target.toFixed(0)}%`,
    40,
    60,
  );

  const cards = [
    ["CUSTO LINHA DE BASE", fmtCurrency(result.totalLinhaBase)],
    ["CUSTO REAL", fmtCurrency(result.totalReal)],
    ["ADERÊNCIA GERAL", pct(result.aderenciaGeral)],
  ];
  const cardY = 78;
  const cardH = 48;
  const gap = 12;
  const cardW = (515 - gap * 2) / 3;
  cards.forEach(([label, value], index) => {
    const x = 40 + index * (cardW + gap);
    doc.setDrawColor(228, 230, 234);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cardY, cardW, cardH, 5, 5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text(label ?? "", x + 10, cardY + 17);
    doc.setFontSize(13);
    doc.setTextColor(index === 2 ? 234 : 33, index === 2 ? 162 : 55, index === 2 ? 57 : 88);
    doc.text(value ?? "", x + 10, cardY + 35);
  });

  const disciplineCards = [
    ["CIVIL", pct(result.groups.civil.aderencia)],
    ["MECÂNICA", pct(result.groups.mecanica.aderencia)],
    ["EIA", pct(result.groups.eia.aderencia)],
  ];
  const cardY2 = cardY + cardH + 12;
  disciplineCards.forEach(([label, value], index) => {
    const x = 40 + index * (cardW + gap);
    doc.setDrawColor(228, 230, 234);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cardY2, cardW, cardH, 5, 5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text(label ?? "", x + 10, cardY2 + 17);
    doc.setFontSize(14);
    doc.setTextColor(33, 55, 88);
    doc.text(value ?? "", x + 10, cardY2 + 35);
  });

  autoTable(doc, {
    startY: cardY2 + cardH + 20,
    head: [["Unidade", "Linha de Base", "Real", "Aderência", "Situação"]],
    body: result.units.map((unit) => [
      unit.name,
      fmtCurrency(unit.custoLinhaBase),
      fmtCurrency(unit.custoReal),
      pct(unit.aderencia),
      unit.aderencia >= result.threshold ? "Dentro da meta" : "Fora da meta",
    ]),
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
    theme: "grid",
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 420;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(48, 79, 126);
  doc.text("Aderência por disciplina", 40, finalY + 24);

  autoTable(doc, {
    startY: finalY + 34,
    head: [["Disciplina", "Linha de Base", "Real", "Aderência", "Situação"]],
    body: result.disciplinas.map((disciplina) => [
      disciplina.name,
      fmtCurrency(disciplina.custoLinhaBase),
      fmtCurrency(disciplina.custoReal),
      pct(disciplina.aderencia),
      disciplina.aderencia >= result.threshold ? "Dentro da meta" : "Fora da meta",
    ]),
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
    theme: "grid",
  });

  doc.save(
    `IDP_Disciplinas_${result.selectedYear}_${MONTH_NAMES_FULL[result.monthStart - 1]}-${MONTH_NAMES_FULL[result.monthEnd - 1]}_${new Date().toISOString().slice(0, 10)}.pdf`,
  );
}

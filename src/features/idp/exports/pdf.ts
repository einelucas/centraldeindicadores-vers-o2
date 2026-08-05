import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { IdpDetailedResult } from "@/features/idp/types";
import { MONTH_NAMES_FULL } from "@/lib/dates";

function pctRatio(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function accumulated(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

export function exportIdpPdf(result: IdpDetailedResult): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const today = new Date().toLocaleDateString("pt-BR");
  const target = result.threshold * 100;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(48, 79, 126);
  doc.text("Cronograma — Avanço Físico (RSO)", 40, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `Gerado em ${today} · período: ${MONTH_NAMES_FULL[result.monthStart - 1]} a ${MONTH_NAMES_FULL[result.monthEnd - 1]}/${result.selectedYear} · meta: ${target.toFixed(0)}%`,
    40,
    60,
  );

  const cards = [
    ["ADERÊNCIA GERAL", pctRatio(result.aderenciaGeral)],
    ["UNIDADES ATIVAS", String(result.activeDocuments)],
  ];
  const cardY = 78;
  const cardH = 48;
  const gap = 12;
  const cardW = (515 - gap) / 2;

  cards.forEach(([label, value], index) => {
    const x = 40 + index * (cardW + gap);
    doc.setDrawColor(228, 230, 234);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cardY, cardW, cardH, 5, 5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text(label ?? "", x + 10, cardY + 17);
    doc.setFontSize(14);
    doc.setTextColor(index === 0 ? 234 : 33, index === 0 ? 162 : 55, index === 0 ? 57 : 88);
    doc.text(value ?? "", x + 10, cardY + 35);
  });

  autoTable(doc, {
    startY: cardY + cardH + 20,
    head: [["Unidade", "RSO", "Competência", "Fases", "Prev. acum.", "Real acum.", "Aderência", "Situação"]],
    body: result.unitRows.map((unit) => [
      unit.unit,
      unit.rsoNumero === null ? "—" : String(unit.rsoNumero),
      new Date(`${unit.referenceDate}T12:00:00`).toLocaleDateString("pt-BR"),
      String(unit.nFases),
      accumulated(unit.prevAcum),
      accumulated(unit.realAcum),
      pctRatio(unit.aderencia),
      unit.aderencia >= result.threshold ? "Dentro da meta" : "Fora da meta",
    ]),
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4.5 },
    theme: "grid",
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 400;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(48, 79, 126);
  doc.text("Aderência por disciplina", 40, finalY + 24);

  autoTable(doc, {
    startY: finalY + 34,
    head: [["Disciplina", "Áreas", "Prev. médio", "Real médio", "Aderência", "Situação"]],
    body: result.disciplineRows.map((row) => {
      if (row.aderencia === null || row.prevAvg === null || row.realAvg === null) {
        return [row.discipline, "0", "—", "—", "—", "Sem dados"];
      }
      return [
        row.discipline,
        String(row.entries.length),
        accumulated(row.prevAvg),
        accumulated(row.realAvg),
        pctRatio(row.aderencia),
        row.aderencia >= result.threshold ? "Dentro da meta" : "Fora da meta",
      ];
    }),
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4.5 },
    theme: "grid",
  });

  doc.save(`IDP_RSO_${new Date().toISOString().slice(0, 10)}.pdf`);
}

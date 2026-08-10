import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { IdpDetailedResult } from "@/features/idp/types";
import { MONTH_NAMES_FULL } from "@/lib/dates";

function pct(value: number): string {
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function accumulated(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function datePt(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function exportIdpPdf(result: IdpDetailedResult): void {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const competence = `${MONTH_NAMES_FULL[result.selectedMonth - 1]}/${result.selectedYear}`;
  const today = new Date().toLocaleDateString("pt-BR");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(48, 79, 126);
  doc.text("IDP — Aderência do Cronograma por RSO", 40, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(105, 105, 105);
  doc.text(
    `Gerado em ${today} · competência: ${competence} · meta: ${(result.threshold * 100).toFixed(0)}% · ${result.activeDocuments} RSO(s) ativo(s)`,
    40,
    58,
  );

  autoTable(doc, {
    startY: 78,
    head: [["Unidade", "RSO", "Período", "Emissão", "Prev. acum.", "Real acum.", "Aderência"]],
    body: result.unitRows.map((unit) => [
      unit.unit,
      String(unit.rsoNumero),
      `${datePt(unit.periodStart)} → ${datePt(unit.periodEnd)}`,
      datePt(unit.emissionDate),
      accumulated(unit.prevAcum),
      accumulated(unit.realAcum),
      pct(unit.aderencia),
    ]),
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5 },
    theme: "grid",
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 220;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(48, 79, 126);
  doc.text("Aderência por disciplina", 40, finalY + 24);

  autoTable(doc, {
    startY: finalY + 34,
    head: [["Disciplina", "Áreas usadas", "Prev. médio", "Real médio", "Aderência"]],
    body: result.disciplineRows.map((row) => [
      row.discipline,
      String(row.entries.length),
      row.prevAvg === null ? "—" : accumulated(row.prevAvg),
      row.realAvg === null ? "—" : accumulated(row.realAvg),
      row.aderencia === null ? "—" : pct(row.aderencia),
    ]),
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 5 },
    theme: "grid",
  });

  doc.save(
    `IDP_RSO_${result.selectedYear}_${String(result.selectedMonth).padStart(2, "0")}_${new Date().toISOString().slice(0, 10)}.pdf`,
  );
}

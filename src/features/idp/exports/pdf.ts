import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { IdpDetailedResult } from "@/features/idp/types";
import { MONTH_NAMES_FULL } from "@/lib/dates";
import { formatIdpUnitLabel } from "@/features/idp/utils/units";

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

/**
 * `doc`: quando informado, desenha nessa página atual em vez de criar um PDF
 * novo, e não salva o arquivo — usado pelo PDF consolidado do Scorecard para
 * empilhar o IDP como mais uma seção do mesmo arquivo. Sem `doc`, comporta-se
 * exatamente como antes (cria e salva o PDF isolado do IDP).
 */
export function exportIdpPdf(result: IdpDetailedResult, doc?: jsPDF): void {
  const pdf = doc ?? new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const competence = `${MONTH_NAMES_FULL[result.selectedMonth - 1]}/${result.selectedYear}`;
  const today = new Date().toLocaleDateString("pt-BR");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(48, 79, 126);
  pdf.text("IDP — Aderência do Cronograma por RSO", 40, 42);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(105, 105, 105);
  pdf.text(
    `Gerado em ${today} · competência: ${competence} · meta: ${(result.threshold * 100).toFixed(0)}% · ${result.activeDocuments} RSO(s) ativo(s)`,
    40,
    58,
  );

  autoTable(pdf, {
    startY: 78,
    head: [["Unidade", "RSO", "Período", "Emissão", "Prev. acum.", "Real acum.", "Aderência"]],
    body: result.unitRows.map((unit) => [
      formatIdpUnitLabel(unit.unit),
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

  const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 220;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.setTextColor(48, 79, 126);
  pdf.text("Aderência por disciplina", 40, finalY + 24);

  autoTable(pdf, {
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

  if (!doc) {
    pdf.save(
      `IDP_RSO_${result.selectedYear}_${String(result.selectedMonth).padStart(2, "0")}_${new Date().toISOString().slice(0, 10)}.pdf`,
    );
  }
}

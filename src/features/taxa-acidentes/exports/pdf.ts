import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { AccidentRateResult } from "@/features/taxa-acidentes/types";
import { formatAccidentUnitLabel } from "@/features/taxa-acidentes/utils/units";

function decimal(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

/**
 * `doc`: quando informado, desenha nessa página atual em vez de criar um PDF
 * novo, e não salva o arquivo — usado pelo PDF consolidado do Scorecard para
 * empilhar a Taxa de Acidentes como mais uma seção do mesmo arquivo. Sem
 * `doc`, cria e salva um PDF isolado, no mesmo padrão dos outros módulos.
 */
export function exportAccidentRatePdf(result: AccidentRateResult, doc?: jsPDF): void {
  const pdf = doc ?? new jsPDF({ unit: "pt", format: "a4" });
  const today = new Date().toLocaleDateString("pt-BR");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(48, 79, 126);
  pdf.text("Taxa de Acidentes", 40, 44);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(110, 110, 110);
  pdf.text(`Gerado em ${today} · meta de frequência: ≤ ${decimal(result.target)}`, 40, 60);

  const cards = [
    ["TAXA DO PERÍODO", result.result === null ? "—" : decimal(result.result)],
    ["ACIDENTES CAF", String(result.totalCaf)],
    ["ACIDENTES SAF POR UNIDADE", String(result.totalSaf)],
    ["DESEMPENHO DO MÊS", result.latestRate === null ? "—" : decimal(result.latestRate)],
  ];
  const cardY = 78;
  const cardH = 50;
  const gap = 10;
  const cardW = (515 - gap * 3) / 4;
  cards.forEach(([label, value], index) => {
    const x = 40 + index * (cardW + gap);
    pdf.setDrawColor(228, 230, 234);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(x, cardY, cardW, cardH, 5, 5, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(107, 114, 128);
    pdf.text(label ?? "", x + 9, cardY + 17);
    pdf.setFontSize(14);
    pdf.setTextColor(33, 55, 88);
    pdf.text(value ?? "", x + 9, cardY + 36);
  });

  autoTable(pdf, {
    startY: cardY + cardH + 18,
    head: [["Mês", "Taxa de Frequência", "Acidentes CAF", "Situação"]],
    body: result.monthly.map((month) => [
      month.label,
      decimal(month.rate),
      month.caf,
      month.ok ? "Dentro da meta" : "Fora da meta",
    ]),
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4 },
    theme: "grid",
  });

  const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 350;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(48, 79, 126);
  pdf.text("Acidentes CAF e SAF por unidade", 40, finalY + 22);

  autoTable(pdf, {
    startY: finalY + 30,
    head: [["Mês", "Unidade", "Acidentes CAF", "Acidentes SAF"]],
    body: result.units.map((unit) => [
      unit.label,
      `${formatAccidentUnitLabel(unit.unit)}${unit.excluded ? " (excluída)" : ""}`,
      unit.caf,
      unit.saf,
    ]),
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4 },
    theme: "grid",
  });

  if (!doc) pdf.save(`TaxaAcidentes_${new Date().toISOString().slice(0, 10)}.pdf`);
}

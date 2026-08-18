import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { exportRdoPdf } from "@/features/rdo/exports/pdf";
import type { RdoResult } from "@/features/rdo/types";
import { exportIdpPdf } from "@/features/idp/exports/pdf";
import type { IdpDetailedResult } from "@/features/idp/types";
import { exportRncPdf } from "@/features/rnc/exports/pdf";
import type { RncResult } from "@/features/rnc/types";
import { exportFiveSPdf } from "@/features/cinco-s/exports/pdf";
import type { FiveSResult } from "@/features/cinco-s/types";
import { exportAccidentRatePdf } from "@/features/taxa-acidentes/exports/pdf";
import type { AccidentRateResult } from "@/features/taxa-acidentes/types";
import { formatPeriodRangeLabel, type PeriodRange } from "@/lib/period";

export interface ScorecardHistoryExportRow {
  indicador: string;
  peso: string;
  meta: string;
  meses: string[];
  media: string;
  pontos: string;
  situacao: string;
}

export interface ScorecardPdfInput {
  cycleRange: PeriodRange;
  monthColumnLabels: string[];
  rows: ScorecardHistoryExportRow[];
  semesterPoints: number;
  semesterPontuacaoPrevista: number;
  semesterAttendance: number;
  scorecardMaxPoints: number;
}

function formatFileDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function drawScorecardSection(pdf: jsPDF, input: ScorecardPdfInput): void {
  const today = new Date().toLocaleDateString("pt-BR");
  const periodLabel = formatPeriodRangeLabel(input.cycleRange);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(48, 79, 126);
  pdf.text("Scorecard — Histórico do ciclo", 40, 44);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(110, 110, 110);
  pdf.text(`Gerado em ${today} · período: ${periodLabel}`, 40, 60);

  const cards = [
    ["PONTOS NO CICLO", input.semesterPoints.toLocaleString("pt-BR", { maximumFractionDigits: 2 })],
    [
      "PONTUAÇÃO PREVISTA — PERÍODO",
      input.semesterPontuacaoPrevista.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
    ],
    ["ATENDIMENTO DO CICLO", `${input.semesterAttendance.toFixed(2)}%`],
    [
      "PONTUAÇÃO PREVISTA — SEMESTRE",
      input.scorecardMaxPoints.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
    ],
  ];
  const cardY = 78;
  const cardH = 50;
  const gap = 10;
  const cardW = (760 - gap * 3) / 4;
  cards.forEach(([label, value], index) => {
    const x = 40 + index * (cardW + gap);
    pdf.setDrawColor(228, 230, 234);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(x, cardY, cardW, cardH, 5, 5, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(107, 114, 128);
    pdf.text(label ?? "", x + 9, cardY + 17);
    pdf.setFontSize(13);
    pdf.setTextColor(33, 55, 88);
    pdf.text(value ?? "", x + 9, cardY + 36);
  });

  autoTable(pdf, {
    startY: cardY + cardH + 18,
    head: [
      [
        "Indicador",
        "Peso",
        "Meta",
        ...input.monthColumnLabels,
        "Média",
        "Pontos",
        "Situação",
      ],
    ],
    body: input.rows.map((row) => [
      row.indicador,
      row.peso,
      row.meta,
      ...row.meses,
      row.media,
      row.pontos,
      row.situacao,
    ]),
    headStyles: { fillColor: [48, 79, 126], textColor: 255, fontStyle: "bold" },
    styles: { font: "helvetica", fontSize: 8, cellPadding: 4 },
    theme: "grid",
  });
}

/**
 * `doc`: quando informado, desenha nessa página atual em vez de criar um PDF
 * novo, e não salva o arquivo — usado pelo PDF consolidado abaixo para
 * empilhar o Scorecard como a primeira seção do mesmo arquivo. Sem `doc`,
 * cria e salva um PDF isolado, no mesmo padrão dos outros módulos.
 */
export function exportScorecardPdf(input: ScorecardPdfInput, doc?: jsPDF): void {
  const pdf = doc ?? new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  drawScorecardSection(pdf, input);
  if (!doc) pdf.save(`Scorecard_${formatFileDate()}.pdf`);
}

export interface ScorecardConsolidatedModules {
  rdo: { result: RdoResult; thresholdPercent: number } | null;
  idp: { result: IdpDetailedResult } | null;
  rnc: { result: RncResult } | null;
  fiveS: { result: FiveSResult } | null;
  accidents: { result: AccidentRateResult } | null;
}

/**
 * PDF único com o Scorecard e, logo abaixo dele, uma seção por módulo de
 * origem que tiver dado no período selecionado — cada um no mesmo layout do
 * seu próprio botão "Baixar PDF" (RDO/RNC/5S/Taxa em retrato, IDP em
 * paisagem), só que empilhados no mesmo arquivo em vez de um download por
 * módulo. Um módulo sem nenhum dado no período é omitido, não gera página em
 * branco.
 */
export function exportScorecardConsolidatedPdf(
  scorecard: ScorecardPdfInput,
  modules: ScorecardConsolidatedModules,
): void {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  drawScorecardSection(doc, scorecard);

  if (modules.rdo) {
    doc.addPage("a4", "portrait");
    exportRdoPdf(modules.rdo.result, modules.rdo.thresholdPercent, doc);
  }
  if (modules.idp) {
    doc.addPage("a4", "landscape");
    exportIdpPdf(modules.idp.result, doc);
  }
  if (modules.rnc) {
    doc.addPage("a4", "portrait");
    exportRncPdf(modules.rnc.result, doc);
  }
  if (modules.fiveS) {
    doc.addPage("a4", "portrait");
    exportFiveSPdf(modules.fiveS.result, doc);
  }
  if (modules.accidents) {
    doc.addPage("a4", "portrait");
    exportAccidentRatePdf(modules.accidents.result, doc);
  }

  doc.save(`Scorecard_consolidado_${formatFileDate()}.pdf`);
}

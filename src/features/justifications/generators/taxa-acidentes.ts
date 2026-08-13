import type { AccidentRateResult } from "@/features/taxa-acidentes/types";
import { formatAccidentUnitLabel } from "@/features/taxa-acidentes/utils/units";
import type {
  JustificationEvidenceItem,
  JustificationSuggestion,
} from "@/features/justifications/types";
import { MONTH_NAMES_FULL } from "@/lib/dates";

interface GenerateAccidentRateInput {
  result: AccidentRateResult;
  previousResult: AccidentRateResult;
  year: number;
  month: number;
  sourceImport: JustificationSuggestion["sourceImport"];
}

function number(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function generateAccidentRateJustification(
  input: GenerateAccidentRateInput,
): JustificationSuggestion {
  const { result, previousResult } = input;
  const currentMonth = result.monthly[0];
  const previousMonth = previousResult.monthly[0];
  const monthName = MONTH_NAMES_FULL[input.month - 1] ?? `Mês ${input.month}`;

  if (!currentMonth) {
    return {
      module: "taxa-acidentes",
      year: input.year,
      month: input.month,
      result: null,
      target: result.target,
      status: "NO_DATA",
      evidence: [],
      suggestedText: `Não há lançamento da taxa de frequência em ${monthName}/${input.year} para gerar uma análise baseada em dados.`,
      sourceImport: input.sourceImport,
    };
  }

  const status = currentMonth.rate <= result.target ? "ON_TARGET" : "BELOW_TARGET";
  const includedUnits = result.units.filter((row) => !row.excluded);
  const excludedUnitCount = new Set(
    result.units.filter((row) => row.excluded).map((row) => row.unit),
  ).size;
  const unitsWithAccidents = includedUnits
    .filter((row) => row.caf + row.saf > 0)
    .sort(
      (a, b) =>
        b.caf + b.saf - (a.caf + a.saf) ||
        b.caf - a.caf ||
        formatAccidentUnitLabel(a.unit).localeCompare(formatAccidentUnitLabel(b.unit), "pt-BR"),
    );
  const unitAccidentTotal = result.totalUnitCaf + result.totalSaf;
  const cafDifference = currentMonth.caf - result.totalUnitCaf;
  const gap = currentMonth.rate - result.target;

  const evidence: JustificationEvidenceItem[] = [
    {
      label: "Taxa de frequência",
      value: number(currentMonth.rate),
      detail: `meta de até ${number(result.target)}`,
    },
    {
      label: "Desvio da meta",
      value: `${gap > 0 ? "+" : ""}${number(gap)}`,
      detail: gap <= 0 ? "resultado dentro da meta" : "resultado acima da meta",
    },
    {
      label: "Acidentes CAF",
      value: String(currentMonth.caf),
      detail: `${result.totalUnitCaf} CAF distribuído(s) por unidade`,
    },
    {
      label: "Acidentes SAF por unidade",
      value: String(result.totalSaf),
      detail: `${includedUnits.length} unidade(s) incluída(s) com lançamento`,
    },
  ];

  if (previousMonth) {
    const variation = currentMonth.rate - previousMonth.rate;
    evidence.push({
      label: "Variação mensal da taxa",
      value: `${variation > 0 ? "+" : ""}${number(variation)}`,
      detail: `mês anterior: ${number(previousMonth.rate)}`,
    });
  }

  const lines = [
    `Em ${monthName}/${input.year}, a taxa de frequência foi de ${number(currentMonth.rate)}, frente à meta de até ${number(result.target)}. O resultado ficou ${gap <= 0 ? `${number(Math.abs(gap))} ponto(s) abaixo ou no limite da meta` : `${number(gap)} ponto(s) acima da meta`}.`,
  ];

  if (previousMonth) {
    const variation = currentMonth.rate - previousMonth.rate;
    lines.push(
      `Em comparação ao mês anterior (${number(previousMonth.rate)}), a taxa ${variation <= 0 ? "melhorou" : "piorou"} ${number(Math.abs(variation))} ponto(s).`,
    );
  } else {
    lines.push("Não há taxa registrada no mês anterior para avaliar a evolução mensal.");
  }

  lines.push(
    `Foram registrados ${currentMonth.caf} acidente(s) CAF no consolidado mensal. No detalhamento das unidades incluídas constam ${result.totalUnitCaf} CAF e ${result.totalSaf} SAF, totalizando ${unitAccidentTotal} ocorrência(s).`,
  );

  if (cafDifference !== 0) {
    lines.push(
      `Há uma diferença de ${Math.abs(cafDifference)} acidente(s) CAF entre o consolidado mensal e a soma por unidade (${currentMonth.caf} contra ${result.totalUnitCaf}); essa divergência deve ser conferida antes da apresentação do resultado.`,
    );
  }

  if (unitsWithAccidents.length) {
    lines.push(
      `As maiores concentrações de ocorrências no detalhamento por unidade foram: ${unitsWithAccidents
        .slice(0, 3)
        .map((row) => {
          const total = row.caf + row.saf;
          const share = unitAccidentTotal > 0 ? (total / unitAccidentTotal) * 100 : 0;
          return `${formatAccidentUnitLabel(row.unit)}: ${total} ocorrência(s) (${row.caf} CAF e ${row.saf} SAF; ${number(share)}% do total por unidade)`;
        })
        .join("; ")}.`,
    );
  } else {
    lines.push(
      "Não há ocorrências CAF ou SAF no detalhamento das unidades incluídas para atribuir concentração no período.",
    );
  }

  if (excludedUnitCount) {
    lines.push(
      `${excludedUnitCount} unidade(s) ignorada(s) ficou(ram) fora das somas e da análise de concentração.`,
    );
  }
  lines.push(
    "A análise identifica evolução, consistência dos totais e concentração das ocorrências; a causa operacional dos acidentes deve ser confirmada e complementada pelo responsável antes do salvamento.",
  );

  return {
    module: "taxa-acidentes",
    year: input.year,
    month: input.month,
    result: currentMonth.rate,
    target: result.target,
    status,
    evidence,
    suggestedText: lines.join("\n\n"),
    sourceImport: input.sourceImport,
  };
}

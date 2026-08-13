import type { IdpDetailedResult } from "@/features/idp/types";
import type {
  JustificationEvidenceItem,
  JustificationSuggestion,
} from "@/features/justifications/types";
import { MONTH_NAMES_FULL } from "@/lib/dates";

interface GenerateIdpInput {
  result: IdpDetailedResult;
  previousResult: IdpDetailedResult;
  sourceImport: JustificationSuggestion["sourceImport"];
}

interface PhaseDeviation {
  unit: string;
  phase: string;
  planned: number;
  actual: number;
  gap: number;
}

function pct(value: number): string {
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function accumulated(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function generateIdpJustification(input: GenerateIdpInput): JustificationSuggestion {
  const { result, previousResult } = input;
  const includedUnits = result.unitRows.filter((unit) => !unit.excluded);
  const previousIncludedUnits = previousResult.unitRows.filter((unit) => !unit.excluded);
  const monthName = MONTH_NAMES_FULL[result.selectedMonth - 1] ?? `Mês ${result.selectedMonth}`;

  if (!includedUnits.length) {
    return {
      module: "idp",
      year: result.selectedYear,
      month: result.selectedMonth,
      result: null,
      target: result.threshold,
      status: "NO_DATA",
      evidence: [],
      suggestedText: `Não há RSOs ativos de unidades incluídas em ${monthName}/${result.selectedYear} para gerar uma análise baseada em dados.`,
      sourceImport: input.sourceImport,
    };
  }

  const gap = result.aderenciaGeral - result.threshold;
  const status = gap >= 0 ? "ON_TARGET" : "BELOW_TARGET";
  const unitsBelowTarget = includedUnits
    .filter((unit) => unit.aderencia < result.threshold)
    .sort((a, b) => a.aderencia - b.aderencia || a.unit.localeCompare(b.unit, "pt-BR"))
    .slice(0, 3);
  const disciplinesBelowTarget = result.disciplineRows
    .filter(
      (discipline) => discipline.aderencia !== null && discipline.aderencia < result.threshold,
    )
    .sort(
      (a, b) =>
        (a.aderencia ?? Number.POSITIVE_INFINITY) - (b.aderencia ?? Number.POSITIVE_INFINITY) ||
        a.discipline.localeCompare(b.discipline, "pt-BR"),
    )
    .slice(0, 3);
  const phaseDeviations: PhaseDeviation[] = includedUnits
    .flatMap((unit) =>
      unit.fases.map((phase) => ({
        unit: unit.unit,
        phase: phase.label,
        planned: phase.prevAcum,
        actual: phase.realAcum,
        gap: phase.prevAcum - phase.realAcum,
      })),
    )
    .filter((phase) => phase.gap > 0)
    .sort((a, b) => b.gap - a.gap || a.unit.localeCompare(b.unit, "pt-BR"))
    .slice(0, 3);
  const previousAdherence = previousIncludedUnits.length ? previousResult.aderenciaGeral : null;

  const evidence: JustificationEvidenceItem[] = [
    {
      label: "Aderência geral",
      value: pct(result.aderenciaGeral),
      detail: `${includedUnits.length} RSO(s) ativo(s) incluído(s) · meta ${pct(result.threshold)}`,
    },
    {
      label: "Unidades abaixo da meta",
      value: String(includedUnits.filter((unit) => unit.aderencia < result.threshold).length),
      detail: `${includedUnits.length} unidade(s) considerada(s) no resultado`,
    },
  ];

  if (previousAdherence !== null) {
    const variation = result.aderenciaGeral - previousAdherence;
    evidence.push({
      label: "Variação mensal",
      value: `${variation >= 0 ? "+" : ""}${(variation * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`,
      detail: `mês anterior: ${pct(previousAdherence)}`,
    });
  }
  if (phaseDeviations[0]) {
    evidence.push({
      label: "Maior desvio de fase",
      value: `${phaseDeviations[0].gap.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`,
      detail: `${phaseDeviations[0].unit} · ${phaseDeviations[0].phase}`,
    });
  }

  const lines = [
    `Em ${monthName}/${result.selectedYear}, a aderência geral do IDP foi de ${pct(result.aderenciaGeral)}, frente à meta de ${pct(result.threshold)}. O resultado ficou ${gap >= 0 ? `${pct(gap)} acima ou no limite da meta` : `${pct(Math.abs(gap))} abaixo da meta`}, considerando o maior RSO de cada uma das ${includedUnits.length} unidade(s) incluída(s) na competência.`,
  ];

  if (unitsBelowTarget.length) {
    lines.push(
      `As menores aderências por unidade foram: ${unitsBelowTarget
        .map(
          (unit) =>
            `${unit.unit} (${pct(unit.aderencia)}; previsto acumulado médio ${accumulated(unit.prevAcum)} e realizado ${accumulated(unit.realAcum)}; RSO ${unit.rsoNumero})`,
        )
        .join("; ")}.`,
    );
  } else {
    lines.push("Nenhuma unidade incluída ficou abaixo da meta na competência analisada.");
  }

  if (disciplinesBelowTarget.length) {
    lines.push(
      `Entre as disciplinas consideradas, as menores aderências foram: ${disciplinesBelowTarget
        .map(
          (discipline) =>
            `${discipline.discipline} (${pct(discipline.aderencia ?? 0)}; previsto médio ${accumulated(discipline.prevAvg ?? 0)} e realizado ${accumulated(discipline.realAvg ?? 0)})`,
        )
        .join("; ")}.`,
    );
  }

  if (phaseDeviations.length) {
    lines.push(
      `Os maiores desvios entre previsto e realizado nas fases dos RSOs ativos foram: ${phaseDeviations
        .map(
          (phase) =>
            `${phase.unit} — ${phase.phase} (${accumulated(phase.planned)} previsto e ${accumulated(phase.actual)} realizado; diferença de ${phase.gap.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.)`,
        )
        .join("; ")}.`,
    );
  }

  if (previousAdherence !== null) {
    const variation = result.aderenciaGeral - previousAdherence;
    lines.push(
      `Em comparação ao mês anterior (${pct(previousAdherence)}), houve ${variation >= 0 ? "avanço" : "recuo"} de ${Math.abs(variation * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ponto(s) percentual(is).`,
    );
  }

  const excludedCount = result.unitRows.filter((unit) => unit.excluded).length;
  if (excludedCount) {
    lines.push(
      `${excludedCount} unidade(s) marcada(s) como ignorada(s) permaneceu(ram) fora do resultado e desta análise.`,
    );
  }
  lines.push(
    "Os dados mostram onde o desvio de cronograma está concentrado, mas não comprovam sua causa operacional; esse contexto deve ser confirmado e complementado pelo responsável antes do salvamento.",
  );

  return {
    module: "idp",
    year: result.selectedYear,
    month: result.selectedMonth,
    result: result.aderenciaGeral,
    target: result.threshold,
    status,
    evidence,
    suggestedText: lines.join("\n\n"),
    sourceImport: input.sourceImport,
  };
}

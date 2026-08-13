import type {
  JustificationEvidenceItem,
  JustificationSuggestion,
} from "@/features/justifications/types";
import type { RncResult } from "@/features/rnc/types";
import { formatRncUnitLabel } from "@/features/rnc/utils/units";
import { MONTH_NAMES_FULL } from "@/lib/dates";

interface GenerateRncInput {
  result: RncResult;
  previousResult: RncResult;
  year: number;
  month: number;
  sourceImport: JustificationSuggestion["sourceImport"];
}

function days(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function generateRncJustification(input: GenerateRncInput): JustificationSuggestion {
  const { result, previousResult } = input;
  const currentMonth = result.months.find(
    (item) => item.year === input.year && item.month === input.month - 1,
  );
  const previousMonth = previousResult.months[0];
  const monthName = MONTH_NAMES_FULL[input.month - 1] ?? `Mês ${input.month}`;

  if (!currentMonth || currentMonth.diasMedios === null) {
    return {
      module: "rnc",
      year: input.year,
      month: input.month,
      result: null,
      target: result.metaDias,
      status: "NO_DATA",
      evidence: [],
      suggestedText: `Não há RNCs solucionadas com tempo de tratativa válido em ${monthName}/${input.year} para gerar uma análise de prazo baseada em dados.`,
      sourceImport: input.sourceImport,
    };
  }

  const averageDays = currentMonth.diasMedios;
  const status = averageDays <= result.metaDias ? "ON_TARGET" : "BELOW_TARGET";
  const allUnitsAboveTarget = result.units
    .filter(
      (unit) => !unit.excluded && unit.diasMedios !== null && unit.diasMedios > result.metaDias,
    )
    .sort(
      (a, b) =>
        (b.diasMedios ?? Number.NEGATIVE_INFINITY) - (a.diasMedios ?? Number.NEGATIVE_INFINITY) ||
        a.name.localeCompare(b.name, "pt-BR"),
    );
  const unitsAboveTarget = allUnitsAboveTarget.slice(0, 3);
  const includedUnitsWithTime = result.units.filter(
    (unit) => !unit.excluded && unit.tratativasComTempo > 0,
  );
  const sampleSize = includedUnitsWithTime.reduce((sum, unit) => sum + unit.tratativasComTempo, 0);
  const worstCase = includedUnitsWithTime
    .filter((unit) => unit.maiorTempoTratativa !== null)
    .sort(
      (a, b) =>
        (b.maiorTempoTratativa ?? Number.NEGATIVE_INFINITY) -
        (a.maiorTempoTratativa ?? Number.NEGATIVE_INFINITY),
    )[0];

  const evidence: JustificationEvidenceItem[] = [
    {
      label: "Prazo médio do mês",
      value: `${days(averageDays)} dias`,
      detail: `meta de até ${days(result.metaDias)} dias · ${currentMonth.solucionados}/${currentMonth.chamados} solucionada(s)`,
    },
    {
      label: "Unidades acima da meta",
      value: String(allUnitsAboveTarget.length),
      detail: `${includedUnitsWithTime.length} unidade(s) incluída(s) com tempo válido`,
    },
  ];

  if (previousMonth?.diasMedios !== null && previousMonth?.diasMedios !== undefined) {
    const variation = averageDays - previousMonth.diasMedios;
    evidence.push({
      label: "Variação mensal",
      value: `${variation >= 0 ? "+" : ""}${days(variation)} dias`,
      detail: `mês anterior: ${days(previousMonth.diasMedios)} dias`,
    });
  }
  if (worstCase?.maiorTempoTratativa !== null && worstCase?.maiorTempoTratativa !== undefined) {
    evidence.push({
      label: "Maior tempo individual",
      value: `${days(worstCase.maiorTempoTratativa)} dias`,
      detail: formatRncUnitLabel(worstCase.name),
    });
  }

  const difference = averageDays - result.metaDias;
  const lines = [
    `Em ${monthName}/${input.year}, o prazo médio de resolução das RNCs foi de ${days(averageDays)} dias, frente à meta de até ${days(result.metaDias)} dias. O resultado ficou ${difference <= 0 ? `${days(Math.abs(difference))} dia(s) abaixo ou no limite da meta` : `${days(difference)} dia(s) acima da meta`}, com ${currentMonth.solucionados} de ${currentMonth.chamados} RNC(s) solucionada(s) na coorte do mês.`,
  ];

  if (unitsAboveTarget.length) {
    lines.push(
      `As unidades com média acima da meta foram: ${unitsAboveTarget
        .map((unit) => {
          const medianText =
            unit.diasMedianos === null ? "sem mediana" : `mediana ${days(unit.diasMedianos)} dias`;
          const offenderText = unit.principalOfensor
            ? `principal ofensor: ${unit.principalOfensor} (${unit.principalOfensorCount} RNC(s))`
            : "sem ofensor identificado";
          return `${formatRncUnitLabel(unit.name)}: média ${days(unit.diasMedios ?? 0)} dias (${medianText}), ${unit.tratadas}/${unit.criadas} tratada(s), ${offenderText}`;
        })
        .join("; ")}.`,
    );
  } else {
    lines.push(
      "Nenhuma unidade incluída com tempo de tratativa válido apresentou média acima da meta.",
    );
  }

  if (worstCase?.maiorTempoTratativa !== null && worstCase?.maiorTempoTratativa !== undefined) {
    lines.push(
      `O maior tempo individual observado foi de ${days(worstCase.maiorTempoTratativa)} dias em ${formatRncUnitLabel(worstCase.name)}. A comparação entre média e mediana deve ser usada para avaliar se poucos casos longos estão elevando o resultado.`,
    );
  }

  if (previousMonth?.diasMedios !== null && previousMonth?.diasMedios !== undefined) {
    const variation = averageDays - previousMonth.diasMedios;
    lines.push(
      `Em comparação ao mês anterior (${days(previousMonth.diasMedios)} dias), o prazo médio ${variation <= 0 ? "melhorou" : "piorou"} ${days(Math.abs(variation))} dia(s).`,
    );
  }
  if (sampleSize < 3) {
    lines.push(
      `A leitura deve ser feita com cautela porque apenas ${sampleSize} tratativa(s) com tempo válido compõe(m) as médias por unidade deste mês.`,
    );
  }
  const excludedCount = result.units.filter((unit) => unit.excluded).length;
  if (excludedCount) {
    lines.push(
      `${excludedCount} unidade(s) ignorada(s) ficou(ram) fora do resultado e desta análise.`,
    );
  }
  lines.push(
    "A análise identifica concentrações e distribuição dos prazos; a causa operacional do atraso deve ser confirmada e complementada pelo responsável antes do salvamento.",
  );

  return {
    module: "rnc",
    year: input.year,
    month: input.month,
    result: averageDays,
    target: result.metaDias,
    status,
    evidence,
    suggestedText: lines.join("\n\n"),
    sourceImport: input.sourceImport,
  };
}

import { aderenciaArea } from "@/features/cinco-s/calculations";
import type { FiveSResult } from "@/features/cinco-s/types";
import { formatFiveSUnitLabel } from "@/features/cinco-s/utils/units";
import type {
  JustificationEvidenceItem,
  JustificationSuggestion,
} from "@/features/justifications/types";
import { MONTH_NAMES_FULL } from "@/lib/dates";

interface GenerateFiveSInput {
  result: FiveSResult;
  previousResult: FiveSResult;
  year: number;
  month: number;
  sourceImport: JustificationSuggestion["sourceImport"];
}

interface AreaDeviation {
  unit: string;
  division: string;
  area: string;
  adherence: number;
  target: number;
  score: number;
}

function pct(value: number): string {
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function generateFiveSJustification(input: GenerateFiveSInput): JustificationSuggestion {
  const units = resultUnits(input.result, input.year, input.month);
  const previousUnits = resultUnits(
    input.previousResult,
    input.previousResult.latestYear ?? input.year,
    input.previousResult.latestMonth ?? input.month,
  );
  const monthName = MONTH_NAMES_FULL[input.month - 1] ?? `Mês ${input.month}`;
  const general = units.length
    ? units.reduce((sum, unit) => sum + unit.aderencia, 0) / units.length
    : null;

  if (general === null) {
    return {
      module: "cinco-s",
      year: input.year,
      month: input.month,
      result: null,
      target: input.result.threshold,
      status: "NO_DATA",
      evidence: [],
      suggestedText: `Não há auditorias 5S de unidades incluídas em ${monthName}/${input.year} para gerar uma análise baseada em dados.`,
      sourceImport: input.sourceImport,
    };
  }

  const status = general >= input.result.threshold ? "ON_TARGET" : "BELOW_TARGET";
  const unitsBelowTarget = units
    .filter((unit) => unit.aderencia < input.result.threshold)
    .sort((a, b) => a.aderencia - b.aderencia || a.unit.localeCompare(b.unit, "pt-BR"));
  const areaDeviations: AreaDeviation[] = units
    .flatMap((unit) =>
      unit.areas.map((area) => ({
        unit: unit.unit,
        division: area.divisao?.trim() || "Sem divisão",
        area: area.area,
        adherence: aderenciaArea(area),
        target: area.meta,
        score: area.nota,
      })),
    )
    .filter((area) => area.adherence < input.result.threshold)
    .sort(
      (a, b) =>
        a.adherence - b.adherence ||
        a.unit.localeCompare(b.unit, "pt-BR") ||
        a.area.localeCompare(b.area, "pt-BR"),
    );
  const divisions = new Map<string, { sum: number; count: number; below: number }>();
  for (const area of units.flatMap((unit) => unit.areas)) {
    const name = area.divisao?.trim() || "Sem divisão";
    const current = divisions.get(name) ?? { sum: 0, count: 0, below: 0 };
    const adherence = aderenciaArea(area);
    current.sum += adherence;
    current.count++;
    if (adherence < input.result.threshold) current.below++;
    divisions.set(name, current);
  }
  const criticalDivisions = Array.from(divisions.entries())
    .map(([name, value]) => ({
      name,
      adherence: value.count ? value.sum / value.count : 0,
      areas: value.count,
      below: value.below,
    }))
    .filter((division) => division.adherence < input.result.threshold)
    .sort((a, b) => a.adherence - b.adherence || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 3);
  const previousGeneral = previousUnits.length
    ? previousUnits.reduce((sum, unit) => sum + unit.aderencia, 0) / previousUnits.length
    : null;

  const evidence: JustificationEvidenceItem[] = [
    {
      label: "Aderência geral",
      value: pct(general),
      detail: `${units.length} unidade(s) incluída(s) · meta ${pct(input.result.threshold)}`,
    },
    {
      label: "Unidades abaixo da meta",
      value: String(unitsBelowTarget.length),
      detail: `${units.length} unidade(s) auditada(s) e incluída(s)`,
    },
    {
      label: "Áreas abaixo da meta",
      value: String(areaDeviations.length),
      detail: `${units.reduce((sum, unit) => sum + unit.areas.length, 0)} área(s) avaliada(s)`,
    },
  ];
  if (previousGeneral !== null) {
    const variation = general - previousGeneral;
    evidence.push({
      label: "Variação mensal",
      value: `${variation >= 0 ? "+" : ""}${(variation * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`,
      detail: `mês anterior: ${pct(previousGeneral)}`,
    });
  }

  const gap = general - input.result.threshold;
  const lines = [
    `Em ${monthName}/${input.year}, a aderência geral do 5S foi de ${pct(general)}, frente à meta de ${pct(input.result.threshold)}. O resultado ficou ${gap >= 0 ? `${pct(gap)} acima ou no limite da meta` : `${pct(Math.abs(gap))} abaixo da meta`}, considerando ${units.length} unidade(s) incluída(s).`,
  ];
  if (unitsBelowTarget.length) {
    lines.push(
      `As menores aderências por unidade foram: ${unitsBelowTarget
        .slice(0, 3)
        .map(
          (unit) =>
            `${formatFiveSUnitLabel(unit.unit)} (${pct(unit.aderencia)}; ${unit.areas.filter((area) => aderenciaArea(area) < input.result.threshold).length} de ${unit.areas.length} área(s) abaixo da meta)`,
        )
        .join("; ")}.`,
    );
  } else {
    lines.push("Nenhuma unidade incluída ficou abaixo da meta no período analisado.");
  }
  if (areaDeviations.length) {
    lines.push(
      `As áreas com menor aderência foram: ${areaDeviations
        .slice(0, 5)
        .map(
          (area) =>
            `${formatFiveSUnitLabel(area.unit)} — ${area.division} / ${area.area} (${pct(area.adherence)}; nota ${area.score.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} de meta ${area.target.toLocaleString("pt-BR", { maximumFractionDigits: 1 })})`,
        )
        .join("; ")}.`,
    );
  }
  if (criticalDivisions.length) {
    lines.push(
      `Por divisão, os menores resultados médios foram: ${criticalDivisions
        .map(
          (division) =>
            `${division.name} (${pct(division.adherence)}; ${division.below} de ${division.areas} área(s) abaixo da meta)`,
        )
        .join("; ")}.`,
    );
  }
  if (previousGeneral !== null) {
    const variation = general - previousGeneral;
    lines.push(
      `Em comparação ao mês anterior (${pct(previousGeneral)}), a aderência ${variation >= 0 ? "avançou" : "recuou"} ${Math.abs(variation * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ponto(s) percentual(is).`,
    );
  }
  const excludedCount = input.result.unitMonths.filter(
    (unit) => unit.year === input.year && unit.month === input.month && unit.excluded,
  ).length;
  if (excludedCount) {
    lines.push(
      `${excludedCount} unidade(s) ignorada(s) ficou(ram) fora do resultado e desta análise.`,
    );
  }
  lines.push(
    "A análise identifica onde as notas baixas estão concentradas; o motivo operacional das não conformidades deve ser confirmado e complementado pelo responsável antes do salvamento.",
  );

  return {
    module: "cinco-s",
    year: input.year,
    month: input.month,
    result: general,
    target: input.result.threshold,
    status,
    evidence,
    suggestedText: lines.join("\n\n"),
    sourceImport: input.sourceImport,
  };
}

function resultUnits(result: FiveSResult, year: number, month: number) {
  return result.unitMonths.filter(
    (unit) => unit.year === year && unit.month === month && !unit.excluded,
  );
}

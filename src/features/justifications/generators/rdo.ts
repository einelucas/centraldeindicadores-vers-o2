import { MONTH_NAMES_FULL } from "@/lib/dates";
import { RDO_STATUS, type RdoNormalizedRecord } from "@/features/rdo/types";
import type {
  JustificationEvidenceItem,
  JustificationSuggestion,
} from "@/features/justifications/types";

interface GenerateRdoInput {
  records: readonly RdoNormalizedRecord[];
  previousRecords: readonly RdoNormalizedRecord[];
  year: number;
  month: number;
  threshold: number;
  excludedUnits: readonly string[];
  sourceImport: JustificationSuggestion["sourceImport"];
}

interface RankedCause {
  name: string;
  pending: number;
  total: number;
  adherence: number;
}

function pct(value: number): string {
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function rankBy<T extends RdoNormalizedRecord>(
  rows: readonly T[],
  readName: (row: T) => string | null,
): RankedCause[] {
  const grouped = new Map<string, { pending: number; total: number; approved: number }>();
  for (const row of rows) {
    const name = readName(row)?.trim();
    if (!name) continue;
    const current = grouped.get(name) ?? { pending: 0, total: 0, approved: 0 };
    current.total++;
    if (row.statusDescricao === RDO_STATUS.APROVADO) current.approved++;
    else current.pending++;
    grouped.set(name, current);
  }
  return Array.from(grouped.entries())
    .map(([name, value]) => ({
      name,
      pending: value.pending,
      total: value.total,
      adherence: value.total ? value.approved / value.total : 0,
    }))
    .filter((item) => item.pending > 0)
    .sort(
      (a, b) => b.pending - a.pending || a.adherence - b.adherence || a.name.localeCompare(b.name),
    )
    .slice(0, 3);
}

export function generateRdoJustification(input: GenerateRdoInput): JustificationSuggestion {
  const excluded = new Set(input.excludedUnits.map((unit) => unit.trim()));
  const rows = input.records.filter((row) => !excluded.has(row.empresaNome.trim()));
  const previousRows = input.previousRecords.filter((row) => !excluded.has(row.empresaNome.trim()));
  const approved = rows.filter((row) => row.statusDescricao === RDO_STATUS.APROVADO).length;
  const review = rows.filter((row) => row.statusDescricao === RDO_STATUS.REVISAR).length;
  const filling = rows.filter((row) => row.statusDescricao === RDO_STATUS.PREENCHENDO).length;
  const otherPending = rows.length - approved - review - filling;
  const adherence = rows.length ? approved / rows.length : null;
  const previousApproved = previousRows.filter(
    (row) => row.statusDescricao === RDO_STATUS.APROVADO,
  ).length;
  const previousAdherence = previousRows.length ? previousApproved / previousRows.length : null;
  const units = rankBy(rows, (row) => row.empresaNome);
  const groups = rankBy(rows, (row) => row.grupo);
  const disciplines = rankBy(rows, (row) => row.disciplina);
  const monthName = MONTH_NAMES_FULL[input.month - 1] ?? `Mês ${input.month}`;

  if (adherence === null) {
    return {
      module: "rdo",
      year: input.year,
      month: input.month,
      result: null,
      target: input.threshold,
      status: "NO_DATA",
      evidence: [],
      suggestedText: `Não há RDOs válidos em ${monthName}/${input.year} para gerar uma análise baseada em dados.`,
      sourceImport: input.sourceImport,
    };
  }

  const gap = adherence - input.threshold;
  const status = gap >= 0 ? "ON_TARGET" : "BELOW_TARGET";
  const evidence: JustificationEvidenceItem[] = [
    {
      label: "Resultado do mês",
      value: pct(adherence),
      detail: `${approved} de ${rows.length} RDOs aprovados · meta ${pct(input.threshold)}`,
    },
    {
      label: "RDOs ainda não aprovados",
      value: String(rows.length - approved),
      detail: `${review} para revisão · ${filling} em preenchimento${otherPending > 0 ? ` · ${otherPending} em outros status` : ""}`,
    },
  ];

  if (previousAdherence !== null) {
    const variation = adherence - previousAdherence;
    evidence.push({
      label: "Variação mensal",
      value: `${variation >= 0 ? "+" : ""}${(variation * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`,
      detail: `mês anterior: ${pct(previousAdherence)}`,
    });
  }
  if (units[0]) {
    evidence.push({
      label: "Maior concentração",
      value: units[0].name,
      detail: `${units[0].pending} não aprovado(s) de ${units[0].total}`,
    });
  }

  const lines = [
    `Em ${monthName}/${input.year}, a aderência de aprovação dos RDOs foi de ${pct(adherence)} (${approved} de ${rows.length}), frente à meta de ${pct(input.threshold)}. O resultado ficou ${gap >= 0 ? `${pct(gap)} acima ou no limite da meta` : `${pct(Math.abs(gap))} abaixo da meta`}.`,
    `No fechamento do período, ${rows.length - approved} RDO(s) ainda não estavam aprovados: ${review} em “Revisar Relatório”, ${filling} em “Preenchendo Relatório”${otherPending > 0 ? ` e ${otherPending} em outros status` : ""}.`,
  ];

  if (units.length) {
    lines.push(
      `As maiores concentrações de RDOs não aprovados ocorreram em: ${units
        .map(
          (unit) =>
            `${unit.name} (${unit.pending} de ${unit.total}; aderência ${pct(unit.adherence)})`,
        )
        .join("; ")}.`,
    );
  }
  if (groups.length) {
    lines.push(
      `Por grupo, destacaram-se: ${groups.map((group) => `${group.name} (${group.pending})`).join("; ")}.`,
    );
  }
  if (disciplines.length) {
    lines.push(
      `Por disciplina, destacaram-se: ${disciplines
        .map((discipline) => `${discipline.name} (${discipline.pending})`)
        .join("; ")}.`,
    );
  }
  if (previousAdherence !== null) {
    const variation = adherence - previousAdherence;
    lines.push(
      `Em comparação ao mês anterior (${pct(previousAdherence)}), houve ${variation >= 0 ? "avanço" : "recuo"} de ${Math.abs(variation * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ponto(s) percentual(is).`,
    );
  }
  lines.push(
    "Os dados identificam onde os RDOs pendentes estão concentrados; o contexto operacional da ocorrência deve ser complementado pelo responsável antes do salvamento.",
  );

  return {
    module: "rdo",
    year: input.year,
    month: input.month,
    result: adherence,
    target: input.threshold,
    status,
    evidence,
    suggestedText: lines.join("\n\n"),
    sourceImport: input.sourceImport,
  };
}

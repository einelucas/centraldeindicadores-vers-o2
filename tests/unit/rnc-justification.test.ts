import { describe, expect, it } from "vitest";
import { computeRncResult } from "@/features/rnc/calculations";
import type { RncNormalizedRecord } from "@/features/rnc/types";
import { generateRncJustification } from "@/features/justifications/generators/rnc";

function record(
  unit: string,
  year: number,
  month: number,
  treatmentDays: number | null,
  offender = "Fornecedor",
): RncNormalizedRecord {
  return {
    statusRnc: treatmentDays === null ? "ABERTA" : "TRATADA",
    unidade: unit,
    dataCriacao: new Date(year, month - 1, 1),
    dataSolucao: treatmentDays === null ? null : new Date(year, month - 1, 2),
    tempoTratativa: treatmentDays,
    ofensor: offender,
    year,
    month,
    raw: {},
  };
}

function result(
  records: RncNormalizedRecord[],
  year: number,
  month: number,
  excludedUnits: string[] = [],
) {
  return computeRncResult(records, 15, excludedUnits, {
    startYear: year,
    startMonth: month,
    endYear: year,
    endMonth: month,
  });
}

describe("generateRncJustification", () => {
  it("explica o prazo por unidade usando média, mediana e ofensor local", () => {
    const current = [
      record("RONDONÓPOLIS", 2026, 6, 30, "Fornecedor"),
      record("RONDONÓPOLIS", 2026, 6, 20, "Fornecedor"),
      record("RONDONÓPOLIS", 2026, 6, 10, "Execução"),
      record("RIO VERDE", 2026, 6, 10, "Processo"),
    ];
    const previous = [record("RONDONÓPOLIS", 2026, 5, 10, "Fornecedor")];
    const suggestion = generateRncJustification({
      result: result(current, 2026, 6),
      previousResult: result(previous, 2026, 5),
      year: 2026,
      month: 6,
      sourceImport: null,
    });

    expect(suggestion.status).toBe("BELOW_TARGET");
    expect(suggestion.result).toBe(17.5);
    expect(suggestion.suggestedText).toContain(
      "RONDONOPOLIS: média 20 dias (mediana 20 dias)",
    );
    expect(suggestion.suggestedText).toContain("principal ofensor: Fornecedor (2 RNC(s))");
    expect(suggestion.suggestedText).toContain("piorou 7,5 dia(s)");
  });

  it("não atribui o desvio a unidades ignoradas", () => {
    const current = [record("IGNORADA", 2026, 6, 60), record("VÁLIDA", 2026, 6, 10)];
    const suggestion = generateRncJustification({
      result: result(current, 2026, 6, ["IGNORADA"]),
      previousResult: result([], 2026, 5, ["IGNORADA"]),
      year: 2026,
      month: 6,
      sourceImport: null,
    });

    expect(suggestion.status).toBe("ON_TARGET");
    expect(suggestion.result).toBe(10);
    expect(suggestion.suggestedText).not.toContain("IGNORADA:");
    expect(suggestion.suggestedText).toContain("1 unidade(s) ignorada(s)");
  });

  it("declara ausência de tratativas válidas sem inventar diagnóstico", () => {
    const suggestion = generateRncJustification({
      result: result([record("X", 2026, 6, null)], 2026, 6),
      previousResult: result([], 2026, 5),
      year: 2026,
      month: 6,
      sourceImport: null,
    });

    expect(suggestion.status).toBe("NO_DATA");
    expect(suggestion.evidence).toEqual([]);
    expect(suggestion.suggestedText).toContain("Não há RNCs solucionadas");
  });
});

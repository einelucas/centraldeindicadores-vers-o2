import { describe, expect, it } from "vitest";
import { computeAccidentRateResult } from "@/features/taxa-acidentes/calculations";
import type { AccidentMonthlyInput, AccidentUnitRecord } from "@/features/taxa-acidentes/types";
import { generateAccidentRateJustification } from "@/features/justifications/generators/taxa-acidentes";

function result(
  monthly: AccidentMonthlyInput[],
  units: AccidentUnitRecord[],
  year: number,
  month: number,
  excludedUnits: string[] = [],
) {
  return computeAccidentRateResult(monthly, units, 7.5, excludedUnits, {
    startYear: year,
    startMonth: month,
    endYear: year,
    endMonth: month,
  });
}

describe("generateAccidentRateJustification", () => {
  it("explica o desvio, a evolução e a concentração real por unidade", () => {
    const monthly = [
      { year: 2026, month: 5, rate: 6.5, caf: 2 },
      { year: 2026, month: 6, rate: 9, caf: 4 },
    ];
    const units = [
      { id: "1", year: 2026, month: 6, unit: "SNP", unitKey: "snp", caf: 2, saf: 3 },
      { id: "2", year: 2026, month: 6, unit: "RVD", unitKey: "rvd", caf: 1, saf: 0 },
    ];
    const suggestion = generateAccidentRateJustification({
      result: result(monthly, units, 2026, 6),
      previousResult: result(monthly, units, 2026, 5),
      year: 2026,
      month: 6,
      sourceImport: null,
    });

    expect(suggestion.status).toBe("BELOW_TARGET");
    expect(suggestion.result).toBe(9);
    expect(suggestion.target).toBe(7.5);
    expect(suggestion.suggestedText).toContain("1,5 ponto(s) acima da meta");
    expect(suggestion.suggestedText).toContain("piorou 2,5 ponto(s)");
    expect(suggestion.suggestedText).toContain("SINOP: 5 ocorrência(s)");
    expect(suggestion.suggestedText).toContain("diferença de 1 acidente(s) CAF");
  });

  it("mantém unidades ignoradas fora da concentração e das somas", () => {
    const monthly = [{ year: 2026, month: 6, rate: 7, caf: 0 }];
    const units = [
      { id: "1", year: 2026, month: 6, unit: "SNP", unitKey: "snp", caf: 5, saf: 5 },
      { id: "2", year: 2026, month: 6, unit: "RVD", unitKey: "rvd", caf: 0, saf: 1 },
    ];
    const suggestion = generateAccidentRateJustification({
      result: result(monthly, units, 2026, 6, ["SNP"]),
      previousResult: result([], [], 2026, 5, ["SNP"]),
      year: 2026,
      month: 6,
      sourceImport: null,
    });

    expect(suggestion.status).toBe("ON_TARGET");
    expect(suggestion.suggestedText).not.toContain("SINOP:");
    expect(suggestion.suggestedText).toContain("RIO VERDE: 1 ocorrência(s)");
    expect(suggestion.suggestedText).toContain("1 unidade(s) ignorada(s)");
  });

  it("declara ausência de taxa mensal sem inventar diagnóstico", () => {
    const suggestion = generateAccidentRateJustification({
      result: result([], [], 2026, 6),
      previousResult: result([], [], 2026, 5),
      year: 2026,
      month: 6,
      sourceImport: null,
    });

    expect(suggestion.status).toBe("NO_DATA");
    expect(suggestion.evidence).toEqual([]);
    expect(suggestion.suggestedText).toContain("Não há lançamento da taxa de frequência");
  });
});

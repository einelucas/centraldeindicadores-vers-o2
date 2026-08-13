import { describe, expect, it } from "vitest";
import { computeIdpResult } from "@/features/idp/calculations";
import type { IdpNormalizedRecord } from "@/features/idp/types";
import { generateIdpJustification } from "@/features/justifications/generators/idp";

function record(
  unit: string,
  year: number,
  month: number,
  planned: number,
  actual: number,
): IdpNormalizedRecord {
  return {
    unit,
    detectedUnit: unit,
    unitAdjusted: false,
    rsoNumero: 10,
    detectedRsoNumero: 10,
    rsoAdjusted: false,
    referenceYear: year,
    referenceMonth: month,
    detectedReferenceYear: year,
    detectedReferenceMonth: month,
    referenceSource: "PDF_MES_REF",
    referenceOriginalText: null,
    referenceAdjusted: false,
    periodStart: null,
    periodEnd: null,
    emissionDate: null,
    fileName: `${unit}.pdf`,
    areas: ["Área 1"],
    discData: {
      "01 - Civil": [{ area: "Área 1", prevAcum: planned, realAcum: actual }],
    },
    execucaoFases: [{ label: "Execução", prevAcum: planned, realAcum: actual }],
    raw: {},
  };
}

function result(
  records: IdpNormalizedRecord[],
  year: number,
  month: number,
  excludedUnits: string[] = [],
) {
  return computeIdpResult(
    records,
    0.9,
    [],
    {
      selectedYear: year,
      selectedMonth: month,
      historyStartYear: year,
      historyMonthStart: month,
      historyEndYear: year,
      historyMonthEnd: month,
    },
    excludedUnits,
  );
}

describe("generateIdpJustification", () => {
  it("explica o desvio por unidade, disciplina e fase com dados reais", () => {
    const currentRecords = [
      record("Rondonópolis", 2026, 6, 50, 25),
      record("Rio Verde", 2026, 6, 50, 50),
    ];
    const previousRecords = [
      record("Rondonópolis", 2026, 5, 50, 50),
      record("Rio Verde", 2026, 5, 50, 50),
    ];
    const suggestion = generateIdpJustification({
      result: result(currentRecords, 2026, 6),
      previousResult: result(previousRecords, 2026, 5),
      sourceImport: null,
    });

    expect(suggestion.status).toBe("BELOW_TARGET");
    expect(suggestion.result).toBe(0.75);
    expect(suggestion.suggestedText).toContain("Rondonópolis (50%");
    expect(suggestion.suggestedText).toContain("01 - Civil (75%");
    expect(suggestion.suggestedText).toContain("diferença de 25 p.p.");
    expect(suggestion.suggestedText).toContain("recuo de 25");
  });

  it("retira unidades ignoradas do resultado e da atribuição do desvio", () => {
    const records = [record("Ignorada", 2026, 6, 50, 5), record("Válida", 2026, 6, 50, 50)];
    const suggestion = generateIdpJustification({
      result: result(records, 2026, 6, ["Ignorada"]),
      previousResult: result([], 2026, 5, ["Ignorada"]),
      sourceImport: null,
    });

    expect(suggestion.status).toBe("ON_TARGET");
    expect(suggestion.result).toBe(1);
    expect(suggestion.suggestedText).not.toContain("Ignorada —");
    expect(suggestion.suggestedText).toContain("1 unidade(s) marcada(s) como ignorada(s)");
  });

  it("declara ausência de RSOs incluídos sem inventar diagnóstico", () => {
    const suggestion = generateIdpJustification({
      result: result([], 2026, 6),
      previousResult: result([], 2026, 5),
      sourceImport: null,
    });

    expect(suggestion.status).toBe("NO_DATA");
    expect(suggestion.evidence).toEqual([]);
    expect(suggestion.suggestedText).toContain("Não há RSOs ativos");
  });
});

import { describe, expect, it } from "vitest";
import { computeFiveSResult } from "@/features/cinco-s/calculations";
import type { FiveSNormalizedRecord } from "@/features/cinco-s/types";
import { generateFiveSJustification } from "@/features/justifications/generators/cinco-s";

function record(
  unit: string,
  year: number,
  month: number,
  areas: FiveSNormalizedRecord["areas"],
): FiveSNormalizedRecord {
  return { unit, year, month, areas, raw: {} };
}

function result(
  records: FiveSNormalizedRecord[],
  year: number,
  month: number,
  excludedUnits: string[] = [],
) {
  return computeFiveSResult(records, excludedUnits, 0.9, {
    startYear: year,
    startMonth: month,
    endYear: year,
    endMonth: month,
  });
}

describe("generateFiveSJustification", () => {
  it("explica o desvio por unidade, divisão e área com notas reais", () => {
    const current = [
      record("SNP", 2026, 6, [
        { divisao: "Obras", area: "Pátio", meta: 100, nota: 50 },
        { divisao: "Obras", area: "Almoxarifado", meta: 100, nota: 70 },
      ]),
      record("RVD", 2026, 6, [{ divisao: "Industrial", area: "Produção", meta: 100, nota: 100 }]),
    ];
    const previous = [
      record("SNP", 2026, 5, [{ divisao: "Obras", area: "Pátio", meta: 100, nota: 100 }]),
      record("RVD", 2026, 5, [{ divisao: "Industrial", area: "Produção", meta: 100, nota: 100 }]),
    ];
    const suggestion = generateFiveSJustification({
      result: result(current, 2026, 6),
      previousResult: result(previous, 2026, 5),
      year: 2026,
      month: 6,
      sourceImport: null,
    });

    expect(suggestion.status).toBe("BELOW_TARGET");
    expect(suggestion.result).toBeCloseTo(0.8);
    expect(suggestion.suggestedText).toContain("SINOP (60%");
    expect(suggestion.suggestedText).toContain("Obras / Pátio (50%; nota 50 de meta 100)");
    expect(suggestion.suggestedText).toContain("Obras (60%; 2 de 2 área(s) abaixo da meta)");
    expect(suggestion.suggestedText).toContain("recuou 20");
  });

  it("mantém unidades ignoradas fora do resultado e da atribuição do desvio", () => {
    const current = [
      record("SP", 2026, 6, [{ divisao: "Corporativo", area: "Escritório", meta: 100, nota: 10 }]),
      record("SNP", 2026, 6, [{ divisao: "Obras", area: "Pátio", meta: 100, nota: 100 }]),
    ];
    const suggestion = generateFiveSJustification({
      result: result(current, 2026, 6, ["SP"]),
      previousResult: result([], 2026, 5, ["SP"]),
      year: 2026,
      month: 6,
      sourceImport: null,
    });

    expect(suggestion.status).toBe("ON_TARGET");
    expect(suggestion.result).toBe(1);
    expect(suggestion.suggestedText).not.toContain("Escritório");
    expect(suggestion.suggestedText).toContain("1 unidade(s) ignorada(s)");
  });

  it("declara ausência de auditorias incluídas sem inventar diagnóstico", () => {
    const suggestion = generateFiveSJustification({
      result: result([], 2026, 6),
      previousResult: result([], 2026, 5),
      year: 2026,
      month: 6,
      sourceImport: null,
    });

    expect(suggestion.status).toBe("NO_DATA");
    expect(suggestion.evidence).toEqual([]);
    expect(suggestion.suggestedText).toContain("Não há auditorias 5S");
  });
});

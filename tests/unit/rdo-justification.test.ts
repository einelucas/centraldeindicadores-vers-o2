import { describe, expect, it } from "vitest";
import { generateRdoJustification } from "@/features/justifications/generators/rdo";
import type { RdoNormalizedRecord } from "@/features/rdo/types";

function record(
  unit: string,
  status: string,
  overrides: Partial<RdoNormalizedRecord> = {},
): RdoNormalizedRecord {
  return {
    dataReferencia: new Date(2026, 5, 10),
    empresaNome: unit,
    statusDescricao: status,
    relatorioId: null,
    grupo: "Civil",
    disciplina: "Concreto",
    year: 2026,
    month: 6,
    raw: {},
    ...overrides,
  };
}

describe("generateRdoJustification", () => {
  it("explica o desvio com as maiores concentrações reais", () => {
    const suggestion = generateRdoJustification({
      records: [
        record("Rondonópolis", "Revisar Relatório"),
        record("Rondonópolis", "Preenchendo Relatório"),
        record("Rondonópolis", "Aprovado"),
        record("Rio Verde", "Aprovado", { grupo: "Mecânica", disciplina: "Tubulação" }),
      ],
      previousRecords: [record("Rondonópolis", "Aprovado")],
      year: 2026,
      month: 6,
      threshold: 0.8,
      excludedUnits: [],
      sourceImport: null,
    });

    expect(suggestion.status).toBe("BELOW_TARGET");
    expect(suggestion.result).toBe(0.5);
    expect(suggestion.suggestedText).toContain("Rondonópolis (2 de 3; aderência 33,3%)");
    expect(suggestion.suggestedText).toContain("recuo de 50");
  });

  it("não atribui o desvio a unidades excluídas", () => {
    const suggestion = generateRdoJustification({
      records: [record("Ignorada", "Revisar Relatório"), record("Válida", "Aprovado")],
      previousRecords: [],
      year: 2026,
      month: 6,
      threshold: 0.8,
      excludedUnits: ["Ignorada"],
      sourceImport: null,
    });

    expect(suggestion.status).toBe("ON_TARGET");
    expect(suggestion.suggestedText).not.toContain("Ignorada");
  });

  it("declara ausência de dados sem inventar uma análise", () => {
    const suggestion = generateRdoJustification({
      records: [],
      previousRecords: [],
      year: 2026,
      month: 6,
      threshold: 0.8,
      excludedUnits: [],
      sourceImport: null,
    });

    expect(suggestion.status).toBe("NO_DATA");
    expect(suggestion.evidence).toEqual([]);
    expect(suggestion.suggestedText).toContain("Não há RDOs válidos");
  });
});

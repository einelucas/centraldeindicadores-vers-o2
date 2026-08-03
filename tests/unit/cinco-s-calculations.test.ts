import { describe, it, expect } from "vitest";
import {
  aderenciaArea,
  aderenciaUnidade,
  computeFiveSResult,
} from "@/features/cinco-s/calculations";
import type { FiveSNormalizedRecord } from "@/features/cinco-s/types";

describe("5S cálculos", () => {
  it("aderência de área = min(nota/meta, 1)", () => {
    expect(aderenciaArea({ divisao: null, area: "A", meta: 100, nota: 90 })).toBeCloseTo(0.9);
    // Nota acima da meta é limitada a 1.
    expect(aderenciaArea({ divisao: null, area: "A", meta: 100, nota: 120 })).toBe(1);
    expect(aderenciaArea({ divisao: null, area: "A", meta: 0, nota: 50 })).toBe(0);
  });

  it("aderência da unidade = média das áreas", () => {
    const media = aderenciaUnidade([
      { divisao: null, area: "A", meta: 100, nota: 100 }, // 1.0
      { divisao: null, area: "B", meta: 100, nota: 80 }, // 0.8
    ]);
    expect(media).toBeCloseTo(0.9);
  });

  it("GERAL exclui as unidades da lista de exclusão", () => {
    const records: FiveSNormalizedRecord[] = [
      {
        unit: "UNIDADE A",
        year: 2026,
        month: 1,
        areas: [{ divisao: null, area: "X", meta: 100, nota: 100 }],
        raw: {},
      },
      {
        unit: "SP",
        year: 2026,
        month: 1,
        areas: [{ divisao: null, area: "Y", meta: 100, nota: 50 }],
        raw: {},
      },
    ];
    const result = computeFiveSResult(records, ["SP"], 0.95);
    // GERAL = média só de UNIDADE A (SP excluída) = 1.0
    expect(result.geral).toBeCloseTo(1);
    expect(result.passaMeta).toBe(true);
  });

  it("passaMeta compara o GERAL do último mês com a meta", () => {
    const records: FiveSNormalizedRecord[] = [
      {
        unit: "A",
        year: 2026,
        month: 1,
        areas: [{ divisao: null, area: "X", meta: 100, nota: 90 }], // 0.9
        raw: {},
      },
    ];
    const result = computeFiveSResult(records, [], 0.95);
    expect(result.geral).toBeCloseTo(0.9);
    expect(result.passaMeta).toBe(false); // 0.9 < 0.95
  });
});

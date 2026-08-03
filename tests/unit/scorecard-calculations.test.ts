import { describe, expect, it } from "vitest";

import {
  computeScorecard,
  indicatorMonthlyPoints,
  scoreIndicator,
} from "@/features/scorecard/calculations";
import {
  SC_INDICATORS,
  SCORECARD_MONTHLY_POOL,
} from "@/features/scorecard/types";

const higher = SC_INDICATORS.find((indicator) => indicator.key === "rdo")!;
const lower = SC_INDICATORS.find((indicator) => indicator.key === "rnc")!;

describe("Scorecard cálculos", () => {
  it("indicador 'higher' passa quando value >= meta", () => {
    expect(scoreIndicator(higher, 80).pass).toBe(true);
    expect(scoreIndicator(higher, 70).pass).toBe(false);
  });

  it("indicador 'lower' passa quando value <= meta", () => {
    expect(scoreIndicator(lower, 10).pass).toBe(true);
    expect(scoreIndicator(lower, 20).pass).toBe(false);
  });

  it("valor ausente não pontua nem passa", () => {
    const result = scoreIndicator(higher, null);
    expect(result.hasValue).toBe(false);
    expect(result.pass).toBe(false);
    expect(result.pontos).toBe(0);
  });

  it("concede os pontos mensais ponderados quando passa", () => {
    expect(scoreIndicator(higher, 80).pontos).toBeCloseTo(
      indicatorMonthlyPoints(higher),
      10,
    );
    expect(scoreIndicator(higher, 70).pontos).toBe(0);
  });

  it("computeScorecard soma os pontos dos indicadores dentro da meta", () => {
    const values = {
      rdo: 80,
      cronograma: 90,
      rnc: 10,
      "5s": 89,
      taxa_acidentes: 8,
    };

    const result = computeScorecard(values);
    const passedKeys = new Set(["rdo", "cronograma", "rnc"]);
    const expected = SC_INDICATORS.filter((indicator) =>
      passedKeys.has(indicator.key),
    ).reduce(
      (sum, indicator) => sum + indicatorMonthlyPoints(indicator),
      0,
    );

    expect(result.totalPontos).toBeCloseTo(expected, 10);
    expect(result.pontosPossiveisMes).toBeCloseTo(
      SCORECARD_MONTHLY_POOL,
      10,
    );
    expect(result.totalPeso).toBeCloseTo(
      SC_INDICATORS.reduce((sum, indicator) => sum + indicator.peso, 0),
      10,
    );
  });

  it("linhas sem valor aparecem como 'sem dado'", () => {
    const result = computeScorecard({});
    expect(result.rows.every((row) => !row.hasValue)).toBe(true);
    expect(result.totalPontos).toBe(0);
  });
});

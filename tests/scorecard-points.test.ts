import { describe, expect, it } from "vitest";

import {
  computeScorecard,
  indicatorMonthlyPoints,
} from "@/features/scorecard/calculations";
import {
  SC_INDICATORS,
  SCORECARD_MAX_POINTS,
  SCORECARD_MONTHLY_POOL,
} from "@/features/scorecard/types";

describe("pontuação do Scorecard 2026", () => {
  it("mantém cinco indicadores com soma de pesos igual a 100%", () => {
    expect(SC_INDICATORS).toHaveLength(5);
    expect(SC_INDICATORS.reduce((sum, item) => sum + item.peso, 0)).toBe(100);
  });

  it("distribui 11.582 pontos em seis meses", () => {
    expect(SCORECARD_MONTHLY_POOL * 6).toBeCloseTo(SCORECARD_MAX_POINTS, 10);
  });

  it("distribui o pool mensal conforme os pesos", () => {
    const total = SC_INDICATORS.reduce(
      (sum, indicator) => sum + indicatorMonthlyPoints(indicator),
      0,
    );
    expect(total).toBeCloseTo(SCORECARD_MONTHLY_POOL, 10);
  });

  it("concede todos os pontos quando todos cumprem a meta", () => {
    const values = Object.fromEntries(
      SC_INDICATORS.map((indicator) => [indicator.key, indicator.meta]),
    );
    const result = computeScorecard(values);
    expect(result.totalPontos).toBeCloseTo(SCORECARD_MONTHLY_POOL, 10);
    expect(result.atendimentoMes).toBeCloseTo(100, 10);
  });

  it("aplica a regra binária sem pontuação parcial", () => {
    const result = computeScorecard({
      rdo: 79.99,
      cronograma: 90,
      rnc: 15.01,
      "5s": 90,
      taxa_acidentes: 7.5,
    });

    expect(result.rows.find((row) => row.key === "rdo")?.pontos).toBe(0);
    expect(result.rows.find((row) => row.key === "rnc")?.pontos).toBe(0);
    expect(result.rows.find((row) => row.key === "cronograma")?.pontos).toBeGreaterThan(0);
    expect(result.rows.find((row) => row.key === "5s")?.pontos).toBeGreaterThan(0);
    expect(result.rows.find((row) => row.key === "taxa_acidentes")?.pontos).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { computeAccidentRateResult } from "@/features/taxa-acidentes/calculations";

describe("Taxa de Acidentes", () => {
  it("calcula média dos meses, soma CAF e organiza CAF/SAF por competência", () => {
    const result = computeAccidentRateResult(
      [
        { year: 2026, month: 2, rate: 8, caf: 2 },
        { year: 2026, month: 1, rate: 6, caf: 1 },
      ],
      [
        {
          id: "1",
          year: 2026,
          month: 2,
          unit: "Sinop",
          unitKey: "SINOP",
          saf: 4,
          caf: 1,
        },
        {
          id: "2",
          year: 2026,
          month: 1,
          unit: "Dourados",
          unitKey: "DOURADOS",
          saf: 2,
          caf: 3,
        },
      ],
      7.5,
    );

    expect(result.result).toBe(7);
    expect(result.totalCaf).toBe(3);
    expect(result.totalUnitCaf).toBe(4);
    expect(result.totalSaf).toBe(6);
    expect(result.latestRate).toBe(8);
    expect(result.latestMonth).toBe(2);
    expect(result.monthly.map((month) => month.month)).toEqual([1, 2]);
    expect(result.units.map((unit) => unit.unit)).toEqual(["DRD", "SNP"]);
    expect(result.units.map((unit) => unit.label)).toEqual(["Janeiro/2026", "Fevereiro/2026"]);
  });

  it("substitui a mesma competência mensal pela última ocorrência", () => {
    const result = computeAccidentRateResult(
      [
        { year: 2026, month: 1, rate: 10, caf: 2 },
        { year: 2026, month: 1, rate: 5, caf: 1 },
      ],
      [],
      7.5,
    );

    expect(result.monthsCount).toBe(1);
    expect(result.result).toBe(5);
    expect(result.totalCaf).toBe(1);
  });
});

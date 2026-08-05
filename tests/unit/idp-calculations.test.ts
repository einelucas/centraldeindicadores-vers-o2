import { describe, expect, it } from "vitest";
import {
  calculateIdpAdherence,
  computeIdpResult,
  disciplineSortKey,
  meetsTarget,
  selectLatestRsoByUnit,
} from "@/features/idp/calculations";
import type { IdpNormalizedRecord } from "@/features/idp/types";

function record(partial: Partial<IdpNormalizedRecord> & { unit: string }): IdpNormalizedRecord {
  return {
    rsoNumero: 1,
    referenceDate: "2026-01-15",
    fileName: `${partial.unit}.pdf`,
    areas: [],
    discData: {},
    execucaoFases: [],
    raw: {},
    ...partial,
  };
}

describe("IDP RSO — cálculos", () => {
  it("aderência = realizado acumulado / previsto acumulado", () => {
    expect(calculateIdpAdherence(98, 100)).toBeCloseTo(0.98);
    expect(calculateIdpAdherence(50, 0)).toBe(0);
  });

  it("seleciona somente o maior número de RSO por unidade", () => {
    const selected = selectLatestRsoByUnit([
      record({ unit: "Unidade A", rsoNumero: 4 }),
      record({ unit: "Unidade A", rsoNumero: 7 }),
      record({ unit: "Unidade B", rsoNumero: 2 }),
    ]);

    expect(selected).toHaveLength(2);
    expect(selected.find((item) => item.unit === "Unidade A")?.rsoNumero).toBe(7);
  });

  it("calcula a unidade pela média das fases e o geral pela média das unidades", () => {
    const result = computeIdpResult([
      record({
        unit: "Unidade A",
        rsoNumero: 3,
        execucaoFases: [
          { prevAcum: 100, realAcum: 90 },
          { prevAcum: 80, realAcum: 80 },
        ],
      }),
      record({
        unit: "Unidade B",
        rsoNumero: 5,
        execucaoFases: [{ prevAcum: 100, realAcum: 100 }],
      }),
    ]);

    const unitA = result.unitRows.find((item) => item.unit === "Unidade A")!;
    expect(unitA.prevAcum).toBe(90);
    expect(unitA.realAcum).toBe(85);
    expect(unitA.aderencia).toBeCloseTo(85 / 90);
    expect(result.aderenciaGeral).toBeCloseTo(((85 / 90) + 1) / 2);
  });

  it("consolida a disciplina pela média simples de todas as áreas", () => {
    const result = computeIdpResult([
      record({
        unit: "Unidade A",
        discData: {
          "01 - Civil": [
            { area: "Área 1", prevAcum: 100, realAcum: 90 },
            { area: "Área 2", prevAcum: 80, realAcum: 80 },
          ],
        },
      }),
      record({
        unit: "Unidade B",
        discData: {
          "01 - Civil": [{ area: "Área 3", prevAcum: 90, realAcum: 81 }],
        },
      }),
    ]);

    const civil = result.disciplineRows.find((item) => item.discipline === "01 - Civil")!;
    expect(civil.prevAvg).toBe(90);
    expect(civil.realAvg).toBeCloseTo(251 / 3);
    expect(civil.aderencia).toBeCloseTo((251 / 3) / 90);
    expect(civil.unitGroups).toHaveLength(2);
  });

  it("remove disciplinas configuradas sem alterar a execução geral", () => {
    const result = computeIdpResult(
      [
        record({
          unit: "Unidade A",
          execucaoFases: [{ prevAcum: 100, realAcum: 98 }],
          discData: {
            "01 - Civil": [{ area: "Área", prevAcum: 100, realAcum: 98 }],
            "04 - Elétrica": [{ area: "Área", prevAcum: 100, realAcum: 90 }],
          },
        }),
      ],
      0.98,
      ["04_Elétrica"],
    );

    expect(result.aderenciaGeral).toBeCloseTo(0.98);
    expect(result.disciplineRows.some((item) => item.discipline === "04 - Elétrica")).toBe(false);
  });


  it("permite consultar uma posição histórica e gera a evolução mensal", () => {
    const result = computeIdpResult(
      [
        record({
          unit: "Unidade A",
          rsoNumero: 1,
          referenceDate: "2026-01-15",
          execucaoFases: [{ prevAcum: 100, realAcum: 80 }],
        }),
        record({
          unit: "Unidade A",
          rsoNumero: 2,
          referenceDate: "2026-03-10",
          execucaoFases: [{ prevAcum: 100, realAcum: 95 }],
        }),
      ],
      0.98,
      [],
      { selectedYear: 2026, monthStart: 1, monthEnd: 3 },
    );

    expect(result.unitRows[0]?.rsoNumero).toBe(2);
    expect(result.monthly.map((month) => month.aderencia)).toEqual([0.8, 0.8, 0.95]);
  });

  it("mantém utilitários de ordenação e meta", () => {
    expect(disciplineSortKey("06 - Automação")).toBe(6);
    expect(disciplineSortKey("Sem código")).toBe(999);
    expect(meetsTarget(0.98, 0.98)).toBe(true);
    expect(meetsTarget(0.9, 0.98)).toBe(false);
  });
});

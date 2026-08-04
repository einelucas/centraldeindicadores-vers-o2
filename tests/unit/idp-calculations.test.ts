import { describe, it, expect } from "vitest";
import {
  calculateIdpAdherence,
  computeIdpDetailedResult,
  computeIdpResult,
  computeIdpSemesterDisciplineDetails,
  disciplineSortKey,
  meetsTarget,
} from "@/features/idp/calculations";
import type { IdpNormalizedRecord } from "@/features/idp/types";

function rec(
  partial: Partial<IdpNormalizedRecord> & {
    unit: string;
    disciplina: string;
    custoLinhaBase: number;
    custoReal: number;
  },
): IdpNormalizedRecord {
  return {
    year: 2026,
    month: 1,
    raw: {},
    ...partial,
  };
}

describe("IDP cálculos", () => {
  it("aderência = real / linha de base", () => {
    expect(calculateIdpAdherence(980, 1000)).toBeCloseTo(0.98);
  });

  it("aderência retorna 0 sem linha de base", () => {
    expect(calculateIdpAdherence(500, 0)).toBe(0);
  });

  it("disciplineSortKey extrai o código numérico", () => {
    expect(disciplineSortKey("01 Civil")).toBe(1);
    expect(disciplineSortKey("06 Automação")).toBe(6);
    expect(disciplineSortKey("Sem código")).toBe(999);
  });

  it("consolida por unidade e disciplina", () => {
    const result = computeIdpResult(
      [
        rec({ unit: "P1", disciplina: "01 Civil", custoLinhaBase: 1000, custoReal: 980 }),
        rec({ unit: "P1", disciplina: "02 Mecânica", custoLinhaBase: 1000, custoReal: 800 }),
        rec({ unit: "P2", disciplina: "01 Civil", custoLinhaBase: 2000, custoReal: 1990 }),
      ],
      0.98,
    );
    expect(result.totalLinhaBase).toBe(4000);
    expect(result.totalReal).toBe(3770);
    expect(result.aderenciaGeral).toBeCloseTo(3770 / 4000);
    expect(result.units.length).toBe(2);
    expect(result.disciplinas.length).toBe(2);
  });

  it("calcula grupos, série mensal e detalhamento sem preencher meses ausentes", () => {
    const result = computeIdpDetailedResult(
      [
        rec({ unit: "P1", month: 6, disciplina: "01 Civil", custoLinhaBase: 1000, custoReal: 980 }),
        rec({ unit: "P1", month: 7, disciplina: "02 Mecânica", custoLinhaBase: 500, custoReal: 450 }),
        rec({ unit: "P2", month: 7, disciplina: "04 Elétrica", custoLinhaBase: 500, custoReal: 500 }),
      ],
      { year: 2026, monthStart: 6, monthEnd: 11, threshold: 0.98 },
    );

    expect(result.monthly.map((month) => month.month)).toEqual([6, 7]);
    expect(result.groups.civil.aderencia).toBeCloseTo(0.98);
    expect(result.groups.mecanica.aderencia).toBeCloseTo(0.9);
    expect(result.groups.eia.aderencia).toBeCloseTo(1);
    expect(result.unitDetails.find((unit) => unit.unit === "P1")?.months.map((month) => month.month)).toEqual([6, 7]);
  });

  it("consolida as disciplinas de todas as unidades nos semestres ligados ao ano de referência", () => {
    const semesters = computeIdpSemesterDisciplineDetails(
      [
        rec({
          unit: "P1",
          year: 2026,
          month: 12,
          disciplina: "01 Civil",
          custoLinhaBase: 100,
          custoReal: 80,
        }),
        rec({
          unit: "P2",
          year: 2027,
          month: 1,
          disciplina: "01 Civil",
          custoLinhaBase: 200,
          custoReal: 190,
        }),
        rec({
          unit: "P3",
          year: 2027,
          month: 1,
          disciplina: "01 Civil",
          custoLinhaBase: 300,
          custoReal: 270,
        }),
        rec({
          unit: "P1",
          year: 2027,
          month: 6,
          disciplina: "02 Mecânica",
          custoLinhaBase: 500,
          custoReal: 400,
        }),
      ],
      2027,
    );

    const decMay = semesters.find((semester) => semester.key === "dec-may")!;
    const junNov = semesters.find((semester) => semester.key === "jun-nov")!;
    const civil = decMay.rows.find((row) => row.disciplina === "01 Civil")!;

    expect(decMay.months.map((month) => [month.year, month.month])).toEqual([
      [2026, 12],
      [2027, 1],
      [2027, 2],
      [2027, 3],
      [2027, 4],
      [2027, 5],
    ]);
    expect(civil.values[1]?.custoLinhaBase).toBe(500);
    expect(civil.totalLinhaBase).toBe(600);
    expect(civil.totalReal).toBe(540);
    expect(civil.aderencia).toBeCloseTo(0.9);
    expect(junNov.rows[0]?.disciplina).toBe("02 Mecânica");
  });

  it("meetsTarget compara com a meta", () => {
    expect(meetsTarget(0.98, 0.98)).toBe(true);
    expect(meetsTarget(0.8, 0.98)).toBe(false);
  });
});

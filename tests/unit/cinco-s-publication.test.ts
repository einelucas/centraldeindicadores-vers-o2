import { describe, expect, it } from "vitest";
import { computeFiveSResult } from "@/features/cinco-s/calculations";
import { toFiveSPublishedPayload } from "@/features/cinco-s/publications";
import type { FiveSNormalizedRecord } from "@/features/cinco-s/types";

const records: FiveSNormalizedRecord[] = [
  {
    unit: "SNP",
    year: 2026,
    month: 6,
    areas: [{ divisao: "Obras", area: "Pátio", meta: 100, nota: 96 }],
    raw: {},
  },
  {
    unit: "SP",
    year: 2026,
    month: 6,
    areas: [{ divisao: "Corporativo", area: "Escritório", meta: 100, nota: 70 }],
    raw: {},
  },
  {
    unit: "SNP",
    year: 2026,
    month: 7,
    areas: [{ divisao: "Obras", area: "Pátio", meta: 100, nota: 98 }],
    raw: {},
  },
];

describe("5S — publicação", () => {
  it("publica somente meses e unidades realmente presentes", () => {
    const result = computeFiveSResult(records, ["SP", "CSC"], 0.9);
    const payload = toFiveSPublishedPayload(result);

    expect(payload.resultado).toBeCloseTo(98);
    expect(payload.meta).toBe(90);
    expect(payload.peso).toBe(0.1);
    expect(payload.pontos).toBe(1_158.2);
    expect(payload.referenceYear).toBe(2026);
    expect(payload.referenceMonth).toBe(7);
    expect(payload.mensal.map((month) => month.label)).toEqual([
      "Jun/2026",
      "Jul/2026",
    ]);
    expect(payload.unidades).toEqual([{ n: "SNP", v: 98 }]);
    expect(payload.excludedUnits).toEqual(["SP", "CSC"]);
  });

  it("não converte ausência de unidade elegível em zero", () => {
    const onlyExcluded = computeFiveSResult([records[1]!], ["SP"], 0.95);
    expect(onlyExcluded.geral).toBeNull();
    expect(() => toFiveSPublishedPayload(onlyExcluded)).toThrow();
  });
});

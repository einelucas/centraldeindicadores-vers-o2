import { describe, expect, it } from "vitest";
import {
  calculateIdpAdherence,
  computeIdpResult,
  recordsInCompetence,
  selectLatestRsoByUnit,
} from "@/features/idp/calculations";
import type { IdpNormalizedRecord } from "@/features/idp/types";

function record(partial: Partial<IdpNormalizedRecord> = {}): IdpNormalizedRecord {
  return {
    unit: "Nova Mutum",
    detectedUnit: "Nova Mutum",
    unitAdjusted: false,
    rsoNumero: 34,
    detectedRsoNumero: 34,
    rsoAdjusted: false,
    referenceYear: 2026,
    referenceMonth: 6,
    detectedReferenceYear: 2026,
    detectedReferenceMonth: 6,
    referenceSource: "PDF_MES_REF",
    referenceOriginalText: "Mês ref.: 01/06/2026",
    referenceAdjusted: false,
    periodStart: "2026-06-24",
    periodEnd: "2026-07-01",
    emissionDate: "2026-07-06",
    fileName: "rso.pdf",
    areas: [],
    discData: {
      "01 - Civil": [{ area: "Pipe Rack", prevAcum: 100, realAcum: 99.5 }],
    },
    execucaoFases: [{ label: "Fase 1", prevAcum: 53.08, realAcum: 54.79 }],
    raw: {},
    ...partial,
  };
}

describe("IDP RSO — cálculos e versionamento", () => {
  it("aderência = realizado / previsto", () => {
    expect(calculateIdpAdherence(54.79, 53.08)).toBeCloseTo(54.79 / 53.08);
  });

  it("seleciona o maior RSO da mesma unidade e competência", () => {
    const selected = selectLatestRsoByUnit([
      record({ rsoNumero: 32 }),
      record({ rsoNumero: 34 }),
      record({ rsoNumero: 33 }),
    ]);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.rsoNumero).toBe(34);
  });

  it("normaliza caixa e acentuação da unidade ao escolher a versão ativa", () => {
    const selected = selectLatestRsoByUnit([
      record({ unit: "RIO VERDE", rsoNumero: 37 }),
      record({ unit: "Rio Verde", rsoNumero: 38 }),
    ]);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.rsoNumero).toBe(38);
  });

  it("não carrega RSO de junho para julho", () => {
    const rows = [record({ referenceMonth: 6, rsoNumero: 34 })];
    expect(recordsInCompetence(rows, 2026, 7)).toEqual([]);
    const result = computeIdpResult(rows, 0.9, [], {
      selectedYear: 2026,
      selectedMonth: 7,
      historyMonthStart: 6,
      historyMonthEnd: 7,
    });
    expect(result.activeDocuments).toBe(0);
    expect(result.monthly.map((item) => item.aderencia)).toEqual([
      expect.any(Number),
      null,
    ]);
  });

  it("mantém versões semanais no histórico, mas calcula apenas a maior versão", () => {
    const rows = [
      record({ rsoNumero: 32, execucaoFases: [{ label: "Fase 1", prevAcum: 50, realAcum: 45 }] }),
      record({ rsoNumero: 34, execucaoFases: [{ label: "Fase 1", prevAcum: 53.08, realAcum: 54.79 }] }),
      record({ unit: "Rio Verde", rsoNumero: 38, execucaoFases: [
        { label: "Fase 1", prevAcum: 51.23, realAcum: 49.5 },
        { label: "Fase 2", prevAcum: 25.55, realAcum: 26.93 },
      ] }),
    ];
    const result = computeIdpResult(rows, 0.9, [], {
      selectedYear: 2026,
      selectedMonth: 6,
      historyMonthStart: 6,
      historyMonthEnd: 6,
    });
    expect(result.activeDocuments).toBe(2);
    expect(result.unitRows.find((item) => item.unit === "Nova Mutum")?.rsoNumero).toBe(34);
    expect(result.unitRows.find((item) => item.unit === "Rio Verde")?.nFases).toBe(2);
  });
});

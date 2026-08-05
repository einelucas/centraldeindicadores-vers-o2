import { describe, expect, it } from "vitest";
import { computeIdpResult } from "@/features/idp/calculations";
import { toIdpPublishedPayload } from "@/features/idp/publications";
import type { IdpNormalizedRecord } from "@/features/idp/types";

function record(): IdpNormalizedRecord {
  return {
    unit: "INPASA Sinop",
    rsoNumero: 12,
    referenceDate: "2026-08-05",
    fileName: "rso-12.pdf",
    areas: ["Área 1"],
    execucaoFases: [{ prevAcum: 100, realAcum: 95.5 }],
    discData: {
      "01 - Civil": [{ area: "Área 1", prevAcum: 100, realAcum: 95.5 }],
      "04 - Elétrica": [{ area: "Área 1", prevAcum: 100, realAcum: 99 }],
    },
    raw: {},
  };
}

describe("toIdpPublishedPayload — RSO", () => {
  it("publica unidades, disciplinas e competência da publicação", () => {
    const result = computeIdpResult([record()], 0.98, [], { selectedYear: 2026, monthStart: 8, monthEnd: 8 });
    const payload = toIdpPublishedPayload(result, 98);

    expect(payload.resultado).toBe(95.5);
    expect(payload.documentosAtivos).toBe(1);
    expect(payload.civil).toBe(95.5);
    expect(payload.eletrica).toBe(99);
    expect(payload.unidades[0]).toEqual({ n: "Sinop", v: 95.5, rsoNumero: 12, referenceDate: "2026-08-05" });
    expect(payload.mensal[0]?.label).toBe("Ago/2026");
  });

  it("impede publicação sem RSO ativo", () => {
    const result = computeIdpResult([], 0.98);
    expect(() => toIdpPublishedPayload(result, 98)).toThrow("Não há documentos RSO ativos");
  });
});

import { describe, expect, it } from "vitest";
import { computeIdpResult } from "@/features/idp/calculations";
import { toIdpPublishedPayload } from "@/features/idp/publications";
import type { IdpNormalizedRecord } from "@/features/idp/types";

function record(): IdpNormalizedRecord {
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
    fileName: "RSO 34.pdf",
    areas: ["1700.A — Pipe Rack"],
    discData: { "01 - Civil": [{ area: "1700.A — Pipe Rack", prevAcum: 100, realAcum: 99.53 }] },
    execucaoFases: [{ label: "Fase 1", prevAcum: 53.08, realAcum: 54.79 }],
    raw: {},
  };
}

describe("publicação do IDP por RSO", () => {
  it("preserva no snapshot o RSO usado", () => {
    const result = computeIdpResult([record()], 0.9, [], {
      selectedYear: 2026,
      selectedMonth: 6,
      historyMonthStart: 6,
      historyMonthEnd: 7,
    });
    const payload = toIdpPublishedPayload(result, 90);
    expect(payload.unidades[0]).toMatchObject({
      n: "Nova Mutum",
      rsoNumero: 34,
      referenceYear: 2026,
      referenceMonth: 6,
      fileName: "RSO 34.pdf",
    });
    expect(payload.mensal[1]?.v).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { computeIdpDetailedResult } from "@/features/idp/calculations";
import { toIdpPublishedPayload } from "@/features/idp/publications";
import type { IdpNormalizedRecord } from "@/features/idp/types";

function record(
  month: number,
  custoLinhaBase: number,
  custoReal: number,
): IdpNormalizedRecord {
  return {
    unit: "INPASA Sinop",
    year: 2026,
    month,
    disciplina: "01 Civil",
    custoLinhaBase,
    custoReal,
    raw: {},
  };
}

describe("toIdpPublishedPayload", () => {
  it("preserva duas casas decimais e não transforma mês sem linha de base em zero", () => {
    const result = computeIdpDetailedResult(
      [record(6, 300, 268.65), record(7, 0, 0)],
      { year: 2026, monthStart: 6, monthEnd: 7, threshold: 0.9 },
    );

    const payload = toIdpPublishedPayload(result, 90);

    expect(payload.resultado).toBe(89.55);
    expect(payload.mensal).toEqual([
      {
        label: "Junho/2026",
        v: 89.55,
        linhaBase: 300,
        real: 268.65,
      },
      {
        label: "Julho/2026",
        v: null,
        linhaBase: 0,
        real: 0,
      },
    ]);
  });

  it("impede publicação quando o período inteiro não possui linha de base", () => {
    const result = computeIdpDetailedResult(
      [record(6, 0, 0)],
      { year: 2026, monthStart: 6, monthEnd: 6, threshold: 0.9 },
    );

    expect(() => toIdpPublishedPayload(result, 90)).toThrow(
      "Não há custo de linha de base válido",
    );
  });
});

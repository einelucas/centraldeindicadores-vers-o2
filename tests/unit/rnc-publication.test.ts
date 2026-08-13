import { describe, expect, it } from "vitest";
import { toRncPublishedPayload } from "@/features/rnc/publications";
import type { RncResult } from "@/features/rnc/types";

const result: RncResult = {
  metaDias: 15,
  excludedUnits: [],
  period: null,
  totalCriadas: 10,
  totalTratadas: 8,
  aderenciaTotal: 0.8,
  resultadoDias: 12.4,
  months: [
    {
      label: "Jun/2026",
      year: 2026,
      month: 5,
      chamados: 4,
      solucionados: 3,
      diasMedios: 10.2,
      dentroMeta: true,
    },
    {
      label: "Jul/2026",
      year: 2026,
      month: 6,
      chamados: 6,
      solucionados: 5,
      diasMedios: 13.7,
      dentroMeta: true,
    },
  ],
  units: [
    {
      name: "INPASA Sinop",
      criadas: 6,
      tratadas: 5,
      aderencia: 5 / 6,
      diasMedios: 12,
      diasMedianos: 11,
      tratativasComTempo: 5,
      maiorTempoTratativa: 20,
      principalOfensor: "Fornecedor",
      principalOfensorCount: 3,
      excluded: false,
    },
    {
      name: "Dourados",
      criadas: 4,
      tratadas: 3,
      aderencia: 0.75,
      diasMedios: 13,
      diasMedianos: 13,
      tratativasComTempo: 3,
      maiorTempoTratativa: 18,
      principalOfensor: "Execução",
      principalOfensorCount: 2,
      excluded: false,
    },
  ],
  ofensores: [
    { name: "Fornecedor", count: 5, pct: 0.5 },
    { name: "Execução", count: 2, pct: 0.2 },
    { name: "Projeto", count: 1, pct: 0.1 },
    { name: "Material", count: 1, pct: 0.1 },
    { name: "Outros real", count: 1, pct: 0.1 },
  ],
};

describe("toRncPublishedPayload", () => {
  it("preserva o formato publicado da referência sem criar meses", () => {
    const payload = toRncPublishedPayload(result);
    expect(payload.resultado).toBe(12.4);
    expect(payload.unidades[0]).toEqual({ n: "Sinop", v: 83 });
    expect(payload.mensal).toEqual([
      { label: "Jun/2026", v: 10.2 },
      { label: "Jul/2026", v: 13.7 },
    ]);
    expect(payload.ofensores.at(-1)).toEqual({ n: "Outros", pct: 10 });
  });

  it("não arredonda um valor acima da meta para dentro da meta", () => {
    const payload = toRncPublishedPayload({
      ...result,
      months: [
        {
          ...result.months[0]!,
          diasMedios: 15.04,
          dentroMeta: false,
        },
      ],
    });

    expect(payload.mensal).toEqual([{ label: "Jun/2026", v: 15.04 }]);
  });

  it("não permite publicação sem tempo de tratativa real", () => {
    expect(() => toRncPublishedPayload({ ...result, resultadoDias: null })).toThrow(
      /tempo de tratativa/i,
    );
  });
});

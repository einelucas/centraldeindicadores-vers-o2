import { describe, expect, it } from "vitest";
import { toRdoPublishedPayload } from "@/features/rdo/publications";
import type { RdoResult } from "@/features/rdo/types";

const result: RdoResult = {
  threshold: 0.8,
  totalEmitidos: 10,
  totalAprovados: 8,
  totalRevisar: 1,
  totalPreenchendo: 1,
  unitAvg: 0.75,
  units: [
    { name: "INPASA Sinop", emitidos: 6, aprovados: 5, aderencia: 5 / 6 },
    { name: "Dourados", emitidos: 4, aprovados: 3, aderencia: 0.75 },
  ],
  months: [
    { label: "Jan/2026", year: 2026, month: 0, emitidos: 10, aprovados: 8, aderencia: 0.8 },
  ],
};

describe("toRdoPublishedPayload", () => {
  it("preserva o formato do snapshot do HTML de referência", () => {
    const payload = toRdoPublishedPayload(result, 80);
    expect(payload.resultado).toBe(80);
    expect(payload.peso).toBe(0.25);
    expect(payload.pontos).toBe(2_895.5);
    expect(payload.emRevisaoPct).toBe(10);
    expect(payload.preenchendoPct).toBe(10);
    expect(payload.unidades[0]).toEqual({ n: "Sinop", v: 83 });
    expect(payload.mensal).toEqual([{ label: "Jan/2026", v: 80 }]);
  });
});

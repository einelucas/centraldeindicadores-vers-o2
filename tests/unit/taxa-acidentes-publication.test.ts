import { describe, expect, it } from "vitest";
import { computeAccidentRateResult } from "@/features/taxa-acidentes/calculations";
import { toAccidentRatePublishedPayload } from "@/features/taxa-acidentes/publications";
import { buildGeneralPanelData } from "@/features/scorecard/publications";

describe("Publicação da Taxa de Acidentes", () => {
  it("alimenta o painel publicado, o comparativo por unidade e o Painel Geral", () => {
    const result = computeAccidentRateResult(
      [
        { year: 2026, month: 1, rate: 6, caf: 1 },
        { year: 2026, month: 2, rate: 8, caf: 2 },
      ],
      [
        {
          id: "unit-1",
          year: 2026,
          month: 2,
          unit: "Sinop",
          unitKey: "SINOP",
          caf: 2,
          saf: 1,
        },
      ],
      7.5,
    );
    const payload = toAccidentRatePublishedPayload(result);

    expect(payload.unidades).toEqual([
      {
        year: 2026,
        month: 2,
        label: "Fevereiro/2026",
        unidade: "SINOP",
        caf: 2,
        saf: 1,
      },
    ]);
    expect(payload.acidentesCafPorUnidade).toBe(2);
    expect(payload.acidentesSaf).toBe(1);

    const panel = buildGeneralPanelData([
      {
        id: "pub-1",
        module: "taxa-acidentes",
        indicator: "taxa",
        version: 1,
        target: 7.5,
        result: 7,
        status: "OK",
        payload,
        publishedAt: new Date("2026-02-28T12:00:00.000Z"),
        publishedBy: { id: "1", name: "Admin", email: "admin@teste.com" },
      },
    ]);

    const indicator = panel.indicators.find((item) => item.key === "taxa_acidentes");
    expect(indicator?.result).toBe(7);
    expect(indicator?.pass).toBe(true);
    expect(indicator?.months.map((month) => month.value)).toEqual([6, 8]);
  });
});

import { describe, expect, it } from "vitest";
import {
  parseRsoPeriodMetadata,
  parseRsoReferenceDate,
  parseRsoReferenceMetadata,
} from "@/features/idp/importers";

describe("leitor de cabeçalho RSO", () => {
  it("reconhece os formatos de Mês ref. usados pelas unidades", () => {
    expect(parseRsoReferenceDate("Mês ref.: 01/06/2026 RSO Nº: 34")).toBe("2026-06-01");
    expect(parseRsoReferenceDate("Mês ref.: Junho/26 RSO Nº: 20")).toBe("2026-06-01");
    expect(parseRsoReferenceDate("Mês ref.: 06/2026")).toBe("2026-06-01");
  });

  it("não usa período, emissão ou data atual como fallback de competência", () => {
    const parsed = parseRsoReferenceMetadata(
      "Período: 24/06/26 – 01/07/26 Emissão: 06/07/2026",
    );
    expect(parsed.referenceYear).toBeNull();
    expect(parsed.referenceMonth).toBeNull();
    expect(parseRsoReferenceDate("Emissão: 06/07/2026")).toBeNull();
  });

  it("separa período e emissão da competência", () => {
    expect(
      parseRsoPeriodMetadata(
        "Unidade: Nova Mutum Projeto: Fase 3 Período: 24/06/2026 01/07/2026 Emissão: 06/07/2026",
      ),
    ).toEqual({
      periodStart: "2026-06-24",
      periodEnd: "2026-07-01",
      emissionDate: "2026-07-06",
    });
  });
});

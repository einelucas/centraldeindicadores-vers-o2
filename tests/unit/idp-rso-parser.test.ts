import { describe, expect, it } from "vitest";
import {
  groupPdfRows,
  parseDisciplineLine,
  parseRsoReferenceDate,
} from "@/features/idp/importers";

describe("leitor PDF do RSO", () => {
  it("reconhece a competência indicada no relatório", () => {
    expect(parseRsoReferenceDate("Data de Referência: 31/07/2026")).toBe("2026-07-31");
    expect(parseRsoReferenceDate("Competência: 08/2026")).toBe("2026-08-01");
  });

  it("reconhece os percentuais acumulados com ponto ou vírgula", () => {
    expect(
      parseDisciplineLine(
        "01 - Civil 95,5% 94,2% -1,3%",
        "01 - Civil",
      ),
    ).toEqual({ prevAcum: 95.5, realAcum: 94.2 });

    expect(
      parseDisciplineLine(
        "04 - Elétrica 100.0% 98.0% -2.0%",
        "04 - Elétrica",
      ),
    ).toEqual({ prevAcum: 100, realAcum: 98 });
  });

  it("agrupa textos próximos na mesma linha e preserva a ordem visual", () => {
    const rows = groupPdfRows([
      { text: "Projeto:", x: 80, y: 700 },
      { text: "Unidade A", x: 160, y: 700.8 },
      { text: "RSO Nº: 12", x: 80, y: 680 },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]?.items.map((item) => item.text)).toEqual([
      "Projeto:",
      "Unidade A",
    ]);
    expect(rows[1]?.items[0]?.text).toBe("RSO Nº: 12");
  });
});

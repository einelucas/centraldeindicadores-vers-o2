import { describe, expect, it } from "vitest";
import { resolvePublicationCycle } from "@/server/publications/cycle";

describe("resolvePublicationCycle", () => {
  it("returns null for a null period", () => {
    expect(resolvePublicationCycle(null)).toBeNull();
  });

  it("resolves S2 (junho-novembro do mesmo ano)", () => {
    expect(
      resolvePublicationCycle({ startYear: 2027, startMonth: 6, endYear: 2027, endMonth: 11 }),
    ).toEqual({ year: 2027, semester: "S2" });
  });

  it("resolves S1 (dezembro atravessando para maio do ano seguinte) usando o ano de término", () => {
    expect(
      resolvePublicationCycle({ startYear: 2027, startMonth: 12, endYear: 2028, endMonth: 5 }),
    ).toEqual({ year: 2028, semester: "S1" });
  });

  it("normaliza um período invertido antes de resolver", () => {
    expect(
      resolvePublicationCycle({ startYear: 2028, startMonth: 5, endYear: 2027, endMonth: 12 }),
    ).toEqual({ year: 2028, semester: "S1" });
  });

  it("retorna null para um período parcial/não-canônico", () => {
    expect(
      resolvePublicationCycle({ startYear: 2027, startMonth: 6, endYear: 2027, endMonth: 8 }),
    ).toBeNull();
  });

  it("retorna null quando o intervalo não é nem S1 nem S2", () => {
    expect(
      resolvePublicationCycle({ startYear: 2027, startMonth: 1, endYear: 2027, endMonth: 12 }),
    ).toBeNull();
  });
});

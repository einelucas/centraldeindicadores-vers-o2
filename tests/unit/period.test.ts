import { describe, it, expect } from "vitest";
import {
  availableCyclesFromMonths,
  cycleForMonth,
  cycleFromYearSemester,
  enumeratePeriodMonths,
  formatPeriodOptionLabel,
  formatPeriodRangeLabel,
  getCurrentCycle,
  getOperationalPeriod,
  isWithinPeriodRange,
  nextPeriod,
  normalizePeriodRange,
  periodFromOptionalFields,
  periodToOptionalFields,
  parsePeriodRangeParams,
  toMonthIndex,
  yearSemesterFromCycle,
  type PeriodRange,
} from "@/lib/period";

describe("nextPeriod", () => {
  it("avança S1 para S2 do mesmo ano do período", () => {
    expect(nextPeriod(2027, "S1")).toEqual({ year: 2027, semester: "S2" });
  });

  it("avança S2 para S1 do ano do período seguinte", () => {
    expect(nextPeriod(2027, "S2")).toEqual({ year: 2028, semester: "S1" });
  });
});

describe("getOperationalPeriod", () => {
  it.each([
    // [ano-calendário, mês, ano do período esperado, semestre esperado]
    [2024, 12, 2025, "S1"],
    [2025, 1, 2025, "S1"],
    [2025, 5, 2025, "S1"],
    [2025, 6, 2025, "S2"],
    [2025, 11, 2025, "S2"],
    [2025, 12, 2026, "S1"],
    [2026, 1, 2026, "S1"],
    [2026, 5, 2026, "S1"],
    [2026, 6, 2026, "S2"],
    [2026, 11, 2026, "S2"],
    [2026, 12, 2027, "S1"],
    [2027, 1, 2027, "S1"],
    [2027, 5, 2027, "S1"],
    [2027, 6, 2027, "S2"],
    [2027, 11, 2027, "S2"],
    [2027, 12, 2028, "S1"],
  ] as const)("classifica %i/%i como %i %s", (year, month, expectedPeriodYear, expectedSemester) => {
    expect(getOperationalPeriod(year, month)).toEqual({
      periodYear: expectedPeriodYear,
      semester: expectedSemester,
    });
  });

  it("trata a fronteira novembro/dezembro corretamente", () => {
    expect(getOperationalPeriod(2026, 11)).toEqual({ periodYear: 2026, semester: "S2" });
    expect(getOperationalPeriod(2026, 12)).toEqual({ periodYear: 2027, semester: "S1" });
  });

  it("trata a fronteira maio/junho corretamente", () => {
    expect(getOperationalPeriod(2027, 5)).toEqual({ periodYear: 2027, semester: "S1" });
    expect(getOperationalPeriod(2027, 6)).toEqual({ periodYear: 2027, semester: "S2" });
  });

  it("rejeita mês fora de 1-12", () => {
    expect(() => getOperationalPeriod(2027, 0)).toThrow(RangeError);
    expect(() => getOperationalPeriod(2027, 13)).toThrow(RangeError);
  });
});

describe("cycleFromYearSemester", () => {
  it("S1: o ano informado é o ano de término (maio)", () => {
    expect(cycleFromYearSemester(2027, "S1")).toEqual({
      startYear: 2026,
      startMonth: 12,
      endYear: 2027,
      endMonth: 5,
    });
  });

  it("S2: início e término no mesmo ano informado", () => {
    expect(cycleFromYearSemester(2027, "S2")).toEqual({
      startYear: 2027,
      startMonth: 6,
      endYear: 2027,
      endMonth: 11,
    });
  });
});

describe("yearSemesterFromCycle", () => {
  it("é o inverso exato de cycleFromYearSemester para S1 e S2", () => {
    expect(yearSemesterFromCycle(cycleFromYearSemester(2027, "S1"))).toEqual({
      year: 2027,
      semester: "S1",
    });
    expect(yearSemesterFromCycle(cycleFromYearSemester(2027, "S2"))).toEqual({
      year: 2027,
      semester: "S2",
    });
  });
});

describe("formatPeriodOptionLabel", () => {
  it("mostra o intervalo resolvido com anos de 2 dígitos, sem ambiguidade", () => {
    expect(formatPeriodOptionLabel(2027, "S1")).toBe("2027 S1 · Dez/26 - Mai/27");
    expect(formatPeriodOptionLabel(2027, "S2")).toBe("2027 S2 · Jun/27 - Nov/27");
  });
});

describe("toMonthIndex", () => {
  it("is monotonic across a year boundary", () => {
    expect(toMonthIndex(2026, 12)).toBeLessThan(toMonthIndex(2027, 1));
    expect(toMonthIndex(2027, 1) - toMonthIndex(2026, 12)).toBe(1);
  });
});

describe("normalizePeriodRange", () => {
  it("keeps an already-ordered range untouched", () => {
    const range: PeriodRange = { startYear: 2026, startMonth: 6, endYear: 2026, endMonth: 11 };
    expect(normalizePeriodRange(range)).toEqual(range);
  });

  it("swaps start/end when inverted, even across years", () => {
    const inverted: PeriodRange = { startYear: 2027, startMonth: 5, endYear: 2026, endMonth: 12 };
    expect(normalizePeriodRange(inverted)).toEqual({
      startYear: 2026,
      startMonth: 12,
      endYear: 2027,
      endMonth: 5,
    });
  });
});

describe("isWithinPeriodRange", () => {
  it("is always true when range is null or undefined (Tudo)", () => {
    expect(isWithinPeriodRange(2026, 1, null)).toBe(true);
    expect(isWithinPeriodRange(2099, 12, undefined)).toBe(true);
  });

  it("evaluates a single-year range", () => {
    const range: PeriodRange = { startYear: 2026, startMonth: 6, endYear: 2026, endMonth: 11 };
    expect(isWithinPeriodRange(2026, 6, range)).toBe(true);
    expect(isWithinPeriodRange(2026, 11, range)).toBe(true);
    expect(isWithinPeriodRange(2026, 5, range)).toBe(false);
    expect(isWithinPeriodRange(2026, 12, range)).toBe(false);
  });

  it("evaluates a year-crossing range (dez/2026 a mai/2027)", () => {
    const range: PeriodRange = { startYear: 2026, startMonth: 12, endYear: 2027, endMonth: 5 };
    expect(isWithinPeriodRange(2026, 12, range)).toBe(true);
    expect(isWithinPeriodRange(2027, 1, range)).toBe(true);
    expect(isWithinPeriodRange(2027, 5, range)).toBe(true);
    expect(isWithinPeriodRange(2026, 11, range)).toBe(false);
    expect(isWithinPeriodRange(2027, 6, range)).toBe(false);
  });
});

describe("enumeratePeriodMonths", () => {
  it("lists every month within a single-year range", () => {
    const range: PeriodRange = { startYear: 2026, startMonth: 6, endYear: 2026, endMonth: 11 };
    expect(enumeratePeriodMonths(range)).toEqual([
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
    ]);
  });

  it("crosses the year boundary in order (dez/2026 a mai/2027)", () => {
    const range: PeriodRange = { startYear: 2026, startMonth: 12, endYear: 2027, endMonth: 5 };
    expect(enumeratePeriodMonths(range)).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
      { year: 2027, month: 3 },
      { year: 2027, month: 4 },
      { year: 2027, month: 5 },
    ]);
  });

  it("handles a single-month range", () => {
    const range: PeriodRange = { startYear: 2026, startMonth: 3, endYear: 2026, endMonth: 3 };
    expect(enumeratePeriodMonths(range)).toEqual([{ year: 2026, month: 3 }]);
  });
});

describe("getCurrentCycle", () => {
  it("returns jun-nov of the same year when reference is inside that window", () => {
    expect(getCurrentCycle(new Date(2026, 7, 15))).toEqual({
      startYear: 2026,
      startMonth: 6,
      endYear: 2026,
      endMonth: 11,
    });
  });

  it("returns dez(year)-mai(year+1) when reference is in december", () => {
    expect(getCurrentCycle(new Date(2026, 11, 20))).toEqual({
      startYear: 2026,
      startMonth: 12,
      endYear: 2027,
      endMonth: 5,
    });
  });

  it("returns dez(year-1)-mai(year) when reference is jan-mai", () => {
    expect(getCurrentCycle(new Date(2027, 2, 5))).toEqual({
      startYear: 2026,
      startMonth: 12,
      endYear: 2027,
      endMonth: 5,
    });
  });
});

describe("cycleForMonth", () => {
  it("maps june through november to S2 of the same year", () => {
    expect(cycleForMonth(2027, 6)).toEqual({
      startYear: 2027,
      startMonth: 6,
      endYear: 2027,
      endMonth: 11,
    });
  });

  it("maps december through may to the cycle that starts in december", () => {
    expect(cycleForMonth(2026, 12)).toEqual({
      startYear: 2026,
      startMonth: 12,
      endYear: 2027,
      endMonth: 5,
    });
    expect(cycleForMonth(2027, 5)).toEqual({
      startYear: 2026,
      startMonth: 12,
      endYear: 2027,
      endMonth: 5,
    });
  });
});

describe("availableCyclesFromMonths", () => {
  it("deduplicates cycles and sorts them from newest to oldest", () => {
    expect(
      availableCyclesFromMonths([
        { year: 2026, month: 6 },
        { year: 2027, month: 5 },
        { year: 2026, month: 12 },
        { year: 2027, month: 7 },
        { year: 2026, month: 8 },
      ]),
    ).toEqual([
      { startYear: 2027, startMonth: 6, endYear: 2027, endMonth: 11 },
      { startYear: 2026, startMonth: 12, endYear: 2027, endMonth: 5 },
      { startYear: 2026, startMonth: 6, endYear: 2026, endMonth: 11 },
    ]);
  });
});

describe("formatPeriodRangeLabel", () => {
  it('returns "Tudo" for null', () => {
    expect(formatPeriodRangeLabel(null)).toBe("Tudo");
  });

  it("formats a year-crossing range", () => {
    const range: PeriodRange = { startYear: 2026, startMonth: 12, endYear: 2027, endMonth: 5 };
    expect(formatPeriodRangeLabel(range)).toBe("Dez/2026 – Mai/2027");
  });
});

describe("parsePeriodRangeParams", () => {
  it("returns null when any of the 4 fields is missing (tudo-ou-nada)", () => {
    const params = new URLSearchParams({
      periodStartYear: "2026",
      periodStartMonth: "12",
      periodEndYear: "2027",
      // periodEndMonth ausente
    });
    expect(parsePeriodRangeParams(params)).toBeNull();
  });

  it("returns null when a field is out of bounds", () => {
    const params = new URLSearchParams({
      periodStartYear: "2026",
      periodStartMonth: "13",
      periodEndYear: "2027",
      periodEndMonth: "5",
    });
    expect(parsePeriodRangeParams(params)).toBeNull();
  });

  it("parses and normalizes a complete, valid range", () => {
    const params = new URLSearchParams({
      periodStartYear: "2026",
      periodStartMonth: "12",
      periodEndYear: "2027",
      periodEndMonth: "5",
    });
    expect(parsePeriodRangeParams(params)).toEqual({
      startYear: 2026,
      startMonth: 12,
      endYear: 2027,
      endMonth: 5,
    });
  });
});

describe("periodFromOptionalFields / periodToOptionalFields", () => {
  it("round-trips a range through the field pair", () => {
    const range: PeriodRange = { startYear: 2026, startMonth: 12, endYear: 2027, endMonth: 5 };
    const fields = periodToOptionalFields(range);
    expect(periodFromOptionalFields(fields)).toEqual(range);
  });

  it("returns null when fields are absent", () => {
    expect(periodFromOptionalFields({})).toBeNull();
    expect(periodToOptionalFields(null)).toEqual({});
  });
});

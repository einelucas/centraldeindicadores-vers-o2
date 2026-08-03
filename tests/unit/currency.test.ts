import { describe, it, expect } from "vitest";
import { parseBRNumberOrNull, toNumberOrZero, fmtPct, fmtCurrency } from "@/lib/currency";

describe("currency", () => {
  it("parses BR numbers", () => {
    expect(parseBRNumberOrNull("1.234,56")).toBeCloseTo(1234.56);
    expect(parseBRNumberOrNull(1234.56)).toBeCloseTo(1234.56);
    expect(parseBRNumberOrNull("")).toBeNull();
    expect(parseBRNumberOrNull("-")).toBeNull();
  });
  it("toNumberOrZero", () => {
    expect(toNumberOrZero("abc")).toBe(0);
    expect(toNumberOrZero("10,5")).toBeCloseTo(10.5);
  });
  it("fmtPct rounds", () => {
    expect(fmtPct(0.76)).toBe("76%");
    expect(fmtPct(null)).toBe("—");
  });
  it("fmtCurrency uses BRL", () => {
    expect(fmtCurrency(1234.5)).toContain("1.234,50");
  });
});

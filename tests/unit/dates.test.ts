import { describe, it, expect } from "vitest";
import { parseFlexDate, excelSerialToDate, fmtDateBR, toIsoDateKey } from "@/lib/dates";

describe("dates", () => {
  it("parses DD/MM/YYYY", () => {
    const d = parseFlexDate("25/12/2026");
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(11);
    expect(d?.getDate()).toBe(25);
  });

  it("parses YYYY-MM-DD", () => {
    const d = parseFlexDate("2026-01-05");
    expect(d?.getMonth()).toBe(0);
    expect(d?.getDate()).toBe(5);
  });

  it("converts Excel serial", () => {
    // 45658 = 01/01/2025 aprox.
    const d = excelSerialToDate(45658);
    expect(d.getFullYear()).toBe(2025);
  });

  it("returns null for garbage", () => {
    expect(parseFlexDate("não é data")).toBeNull();
  });

  it("formats BR and ISO key", () => {
    const d = new Date(2026, 2, 9);
    expect(fmtDateBR(d)).toBe("09/03/2026");
    expect(toIsoDateKey(d)).toBe("2026-03-09");
  });
});

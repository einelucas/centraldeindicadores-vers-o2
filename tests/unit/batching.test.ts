import { describe, it, expect } from "vitest";
import { chunk, DEFAULT_IMPORT_BATCH_SIZE } from "@/lib/batching";

describe("batching", () => {
  it("splits into batches", () => {
    const items = Array.from({ length: 10000 }, (_, i) => i);
    const batches = chunk(items, 500);
    expect(batches.length).toBe(20);
    expect(batches[0]?.length).toBe(500);
    expect(batches.at(-1)?.length).toBe(500);
  });
  it("default size is 500", () => {
    expect(DEFAULT_IMPORT_BATCH_SIZE).toBe(500);
  });
  it("handles remainder", () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
  it("throws on invalid size", () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

import { describe, it, expect } from "vitest";
import {
  normHeader,
  normalizeRows,
  normalizeForKey,
  normalizeForMatch,
  nullIfEmpty,
  collapseSpaces,
} from "@/lib/normalization";

describe("normalization", () => {
  it("normHeader lowercases and underscores", () => {
    expect(normHeader("  Status Descrição ")).toBe("status_descrição");
    expect(normHeader("Empresa Nome")).toBe("empresa_nome");
  });

  it("normalizeRows renames all keys", () => {
    const rows = normalizeRows([{ "Empresa Nome": "X", Data: 1 }]);
    expect(rows[0]).toEqual({ empresa_nome: "X", data: 1 });
  });

  it("normalizeForKey uppercases and collapses spaces, keeps accents", () => {
    expect(normalizeForKey("  São   Paulo ")).toBe("SÃO PAULO");
  });

  it("normalizeForMatch strips accents and punctuation", () => {
    expect(normalizeForMatch("Construção & Cia. LTDA")).toBe("CONSTRUCAO CIA LTDA");
  });

  it("nullIfEmpty handles blanks and dashes", () => {
    expect(nullIfEmpty("")).toBeNull();
    expect(nullIfEmpty("-")).toBeNull();
    expect(nullIfEmpty(null)).toBeNull();
    expect(nullIfEmpty(" abc ")).toBe("abc");
  });

  it("collapseSpaces trims and collapses", () => {
    expect(collapseSpaces("a   b  c")).toBe("a b c");
  });
});

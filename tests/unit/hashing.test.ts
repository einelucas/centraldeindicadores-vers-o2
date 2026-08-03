import { describe, it, expect } from "vitest";
import { makeBusinessKey, makeContentHash, buildKeyString } from "@/lib/hashing";

describe("hashing", () => {
  it("buildKeyString normalizes parts", () => {
    expect(buildKeyString(["  a ", "B"])).toBe("A|B");
  });

  it("businessKey is stable and prefixed", () => {
    const k1 = makeBusinessKey("rdo", ["123", "2026-01-01", "UNIDADE"]);
    const k2 = makeBusinessKey("rdo", ["123", "2026-01-01", "unidade"]);
    expect(k1).toBe(k2); // case-insensitive na comparação
    expect(k1.startsWith("RDO:")).toBe(true);
  });

  it("contentHash changes only when mutable fields change", () => {
    const a = makeContentHash({ status: "Aprovado", obs: "x" });
    const b = makeContentHash({ status: "Aprovado", obs: "x" });
    const c = makeContentHash({ status: "Revisar", obs: "x" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("contentHash is order-independent", () => {
    const a = makeContentHash({ status: "X", obs: "Y" });
    const b = makeContentHash({ obs: "Y", status: "X" });
    expect(a).toBe(b);
  });
});

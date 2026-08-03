import { describe, it, expect } from "vitest";
import { rdoBusinessKey, rdoContentHash } from "@/features/rdo/utils/keys";
import type { RdoNormalizedRecord } from "@/features/rdo/types";

function rec(over: Partial<RdoNormalizedRecord> = {}): RdoNormalizedRecord {
  return {
    dataReferencia: new Date(2026, 0, 15),
    empresaNome: "UNIDADE A",
    statusDescricao: "Aprovado",
    relatorioId: "R-1",
    grupo: "G1",
    disciplina: "Civil",
    year: 2026,
    month: 1,
    raw: {},
    ...over,
  };
}

describe("RDO keys", () => {
  it("same relatorioId but different disciplina => different businessKey", () => {
    const k1 = rdoBusinessKey(rec({ disciplina: "Civil" }));
    const k2 = rdoBusinessKey(rec({ disciplina: "Mecânica" }));
    expect(k1).not.toBe(k2); // relatorio_id sozinho não basta
  });

  it("identical logical identity => same businessKey", () => {
    expect(rdoBusinessKey(rec())).toBe(rdoBusinessKey(rec()));
  });

  it("status change => different contentHash, same businessKey", () => {
    const a = rec({ statusDescricao: "Preenchendo Relatório" });
    const b = rec({ statusDescricao: "Aprovado" });
    expect(rdoBusinessKey(a)).toBe(rdoBusinessKey(b));
    expect(rdoContentHash(a)).not.toBe(rdoContentHash(b));
  });
});

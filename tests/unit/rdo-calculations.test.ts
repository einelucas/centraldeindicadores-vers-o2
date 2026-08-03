import { describe, it, expect } from "vitest";
import {
  computeRdoResult,
  calculateRdoAdherence,
  meetsTarget,
} from "@/features/rdo/calculations";
import { RDO_DEFAULT_TARGET, type RdoNormalizedRecord } from "@/features/rdo/types";

function rec(over: Partial<RdoNormalizedRecord>): RdoNormalizedRecord {
  return {
    dataReferencia: new Date(2026, 0, 10),
    empresaNome: "UNIDADE A",
    statusDescricao: "Aprovado",
    relatorioId: null,
    grupo: null,
    disciplina: null,
    year: 2026,
    month: 1,
    raw: {},
    ...over,
  };
}

describe("RDO calculations", () => {
  it("adherence = approved / issued, zero-safe", () => {
    expect(calculateRdoAdherence(76, 100)).toBeCloseTo(0.76);
    expect(calculateRdoAdherence(1, 0)).toBe(0);
  });

  it("default target is 80%", () => {
    expect(RDO_DEFAULT_TARGET).toBe(0.8);
  });

  it("counts only rows with valid date and unit", () => {
    const r = computeRdoResult([
      rec({ statusDescricao: "Aprovado" }),
      rec({ empresaNome: "" }), // ignorada (sem unidade)
    ]);
    expect(r.totalEmitidos).toBe(1);
  });

  it("aggregates by status", () => {
    const r = computeRdoResult([
      rec({ statusDescricao: "Aprovado" }),
      rec({ statusDescricao: "Aprovado" }),
      rec({ statusDescricao: "Revisar Relatório" }),
      rec({ statusDescricao: "Preenchendo Relatório" }),
    ]);
    expect(r.totalEmitidos).toBe(4);
    expect(r.totalAprovados).toBe(2);
    expect(r.totalRevisar).toBe(1);
    expect(r.totalPreenchendo).toBe(1);
  });

  it("aggregates by unit and month", () => {
    const r = computeRdoResult([
      rec({ empresaNome: "A", statusDescricao: "Aprovado" }),
      rec({ empresaNome: "B", statusDescricao: "Revisar Relatório" }),
      rec({ empresaNome: "A", dataReferencia: new Date(2026, 1, 2), month: 2, statusDescricao: "Aprovado" }),
    ]);
    expect(r.units.length).toBe(2);
    expect(r.months.length).toBe(2);
    const unitA = r.units.find((u) => u.name === "A");
    expect(unitA?.emitidos).toBe(2);
    expect(unitA?.aprovados).toBe(2);
  });

  it("meetsTarget compares to threshold", () => {
    expect(meetsTarget(0.8, 0.8)).toBe(true);
    expect(meetsTarget(0.7, 0.8)).toBe(false);
  });
});

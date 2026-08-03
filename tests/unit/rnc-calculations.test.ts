import { describe, it, expect } from "vitest";
import { computeRncResult } from "@/features/rnc/calculations";
import type { RncNormalizedRecord } from "@/features/rnc/types";

function rec(
  partial: Partial<RncNormalizedRecord> & {
    dataCriacao: Date;
  },
): RncNormalizedRecord {
  return {
    statusRnc: "TRATADA",
    unidade: "UNID A",
    dataSolucao: null,
    tempoTratativa: null,
    ofensor: "N/A",
    year: partial.dataCriacao.getFullYear(),
    month: partial.dataCriacao.getMonth() + 1,
    raw: {},
    ...partial,
  };
}

describe("RNC cálculos", () => {
  it("agrega por mês de criação e calcula dias médios de tratativa", () => {
    const result = computeRncResult(
      [
        rec({
          dataCriacao: new Date("2026-01-05"),
          dataSolucao: new Date("2026-01-12"),
          tempoTratativa: 7,
        }),
        rec({
          dataCriacao: new Date("2026-01-06"),
          dataSolucao: new Date("2026-01-28"),
          tempoTratativa: 21,
        }),
      ],
      15,
    );
    expect(result.months.length).toBe(1);
    const jan = result.months[0]!;
    expect(jan.chamados).toBe(2);
    expect(jan.solucionados).toBe(2);
    expect(jan.diasMedios).toBeCloseTo(14); // (7+21)/2
    expect(jan.dentroMeta).toBe(true); // 14 <= 15
  });

  it("chamado sem solução não entra na média de dias", () => {
    const result = computeRncResult(
      [
        rec({
          dataCriacao: new Date("2026-02-01"),
          dataSolucao: null,
          tempoTratativa: null,
          statusRnc: "ABERTA",
        }),
      ],
      15,
    );
    const feb = result.months[0]!;
    expect(feb.chamados).toBe(1);
    expect(feb.solucionados).toBe(0);
    expect(feb.diasMedios).toBeNull();
    expect(feb.dentroMeta).toBeNull();
  });

  it("aderência por unidade = tratadas / criadas", () => {
    const result = computeRncResult(
      [
        rec({ dataCriacao: new Date("2026-01-05"), statusRnc: "TRATADA", unidade: "X" }),
        rec({ dataCriacao: new Date("2026-01-06"), statusRnc: "ABERTA", unidade: "X" }),
      ],
      15,
    );
    const unit = result.units.find((u) => u.name === "X")!;
    expect(unit.criadas).toBe(2);
    expect(unit.tratadas).toBe(1);
    expect(unit.aderencia).toBeCloseTo(0.5);
  });

  it("conta ofensores e calcula participação", () => {
    const result = computeRncResult(
      [
        rec({ dataCriacao: new Date("2026-01-05"), ofensor: "Fornecedor" }),
        rec({ dataCriacao: new Date("2026-01-06"), ofensor: "Fornecedor" }),
        rec({ dataCriacao: new Date("2026-01-07"), ofensor: "Processo" }),
      ],
      15,
    );
    const top = result.ofensores[0]!;
    expect(top.name).toBe("Fornecedor");
    expect(top.count).toBe(2);
    expect(top.pct).toBeCloseTo(2 / 3);
  });
  it("calcula o resultado geral ponderado pelas RNCs solucionadas", () => {
    const result = computeRncResult(
      [
        rec({
          dataCriacao: new Date("2026-06-01"),
          dataSolucao: new Date("2026-06-11"),
          tempoTratativa: 10,
        }),
        rec({
          dataCriacao: new Date("2026-07-01"),
          dataSolucao: new Date("2026-07-21"),
          tempoTratativa: 20,
        }),
        rec({
          dataCriacao: new Date("2026-07-02"),
          dataSolucao: new Date("2026-07-22"),
          tempoTratativa: 20,
        }),
      ],
      15,
    );
    // Junho: 10 dias com peso 1; julho: 20 dias com peso 2.
    expect(result.resultadoDias).toBeCloseTo(50 / 3);
  });

});

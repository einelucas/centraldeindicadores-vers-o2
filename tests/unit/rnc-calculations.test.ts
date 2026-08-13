import { describe, it, expect } from "vitest";
import { averageMonthlyRncDays, computeRncResult } from "@/features/rnc/calculations";
import type { RncNormalizedRecord } from "@/features/rnc/types";

function monthsWith(diasMedios: Array<number | null>) {
  return diasMedios.map((value) => ({ diasMedios: value }));
}

function recordsForMonth(monthIndex: number, tempoTratativas: number[]): RncNormalizedRecord[] {
  return tempoTratativas.map((tempoTratativa, index) =>
    rec({
      dataCriacao: new Date(2026, monthIndex, index + 1),
      dataSolucao: new Date(2026, monthIndex, index + 2),
      tempoTratativa,
    }),
  );
}

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
  it("consolida pela média simples dos meses, não pela quantidade solucionada", () => {
    const result = computeRncResult(
      [
        // Junho: 1 RNC solucionada, 10 dias.
        ...recordsForMonth(5, [10]),
        // Julho: 2 RNCs solucionadas, 20 dias cada.
        ...recordsForMonth(6, [20, 20]),
      ],
      15,
    );
    expect(result.months.length).toBe(2);
    // Média simples (10 + 20) / 2 = 15 — não a ponderada (50/3 ≈ 16,67).
    expect(result.resultadoDias).toBeCloseTo(15);
  });

  it("caso 6 — o cálculo mensal individual continua inalterado pela mudança na consolidação", () => {
    const result = computeRncResult(recordsForMonth(5, Array(14).fill(28.5)), 15);
    const jun = result.months[0]!;
    expect(jun.chamados).toBe(14);
    expect(jun.solucionados).toBe(14);
    expect(jun.diasMedios).toBeCloseTo(28.5);
  });
});

describe("RNC por unidade — evidências da análise", () => {
  it("calcula média, mediana, maior prazo e ofensor dentro de cada unidade", () => {
    const result = computeRncResult(
      [
        rec({
          dataCriacao: new Date("2026-06-01"),
          dataSolucao: new Date("2026-06-11"),
          tempoTratativa: 10,
          unidade: "X",
          ofensor: "Fornecedor",
        }),
        rec({
          dataCriacao: new Date("2026-06-02"),
          dataSolucao: new Date("2026-07-02"),
          tempoTratativa: 30,
          unidade: "X",
          ofensor: "Fornecedor",
        }),
        rec({
          dataCriacao: new Date("2026-06-03"),
          dataSolucao: new Date("2026-06-23"),
          tempoTratativa: 20,
          unidade: "X",
          ofensor: "Execução",
        }),
      ],
      15,
    );

    const unit = result.units.find((item) => item.name === "X")!;
    expect(unit.diasMedios).toBe(20);
    expect(unit.diasMedianos).toBe(20);
    expect(unit.maiorTempoTratativa).toBe(30);
    expect(unit.tratativasComTempo).toBe(3);
    expect(unit.principalOfensor).toBe("Fornecedor");
    expect(unit.principalOfensorCount).toBe(2);
  });
});

describe("averageMonthlyRncDays — média simples dos resultados mensais", () => {
  it("caso 1 — Jun 28,5 e Jul 11,3 consolidam para 19,9", () => {
    expect(averageMonthlyRncDays(monthsWith([28.5, 11.3]))).toBeCloseTo(19.9, 10);
  });

  it("caso 2 — mês sem resultado válido não entra na soma nem no denominador", () => {
    // (20 + 10) / 2 = 15, e não (20 + 0 + 10) / 3.
    expect(averageMonthlyRncDays(monthsWith([20, null, 10]))).toBeCloseTo(15);
  });

  it("caso 3 — um único mês válido retorna o próprio valor", () => {
    expect(averageMonthlyRncDays(monthsWith([17.4]))).toBeCloseTo(17.4);
  });

  it("caso 4 — nenhum mês válido retorna null", () => {
    expect(averageMonthlyRncDays(monthsWith([null, null]))).toBeNull();
    expect(averageMonthlyRncDays([])).toBeNull();
  });

  it("caso 5 — meses com quantidades de RNCs muito diferentes pesam igual", () => {
    // Mês A: média 10 (100 tratadas). Mês B: média 30 (1 tratada).
    // Resultado correto = 20, e não ~10,2 (o que daria uma ponderação pelo volume).
    const result = averageMonthlyRncDays(monthsWith([10, 30]));
    expect(result).toBeCloseTo(20);
    expect(result).not.toBeCloseTo(10.2, 0);
  });

  it("valida o cenário oficial: 14 RNCs a 28,5 dias em Jun e 10 RNCs a 11,3 dias em Jul", () => {
    const result = computeRncResult(
      [...recordsForMonth(5, Array(14).fill(28.5)), ...recordsForMonth(6, Array(10).fill(11.3))],
      15,
    );
    expect(result.resultadoDias).toBeCloseTo(19.9, 10);
    // A fórmula antiga (ponderada por solucionados) daria ~21,3 — não é mais usada.
    expect(result.resultadoDias).not.toBeCloseTo(21.3, 0);
  });
});

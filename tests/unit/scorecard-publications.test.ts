import { describe, expect, it } from "vitest";
import {
  buildGeneralPanelData,
  monthLabelToKey,
  percentOfTarget,
  SCORECARD_MONTHLY_POOL,
} from "@/features/scorecard/publications";
import { SC_INDICATORS } from "@/features/scorecard/types";

const publisher = { id: "u1", name: "Admin", email: "admin@example.com" };

const rdoPublication = {
  id: "pub-rdo",
  module: "rdo",
  indicator: "aprovacao",
  version: 1,
  target: 0.8,
  result: 0.82,
  status: "OK",
  payload: {
    pontos: 2_895.5,
    peso: 0.25,
    meta: 80,
    resultado: 82,
    aprovados: 82,
    emitidos: 100,
    emRevisaoPct: 10,
    preenchendoPct: 8,
    unidades: [{ n: "Sinop", v: 82 }],
    mensal: [
      { label: "Jun/2026", v: 79 },
      { label: "Jul/2026", v: 82 },
    ],
  },
  publishedAt: new Date("2026-08-01T12:00:00.000Z"),
  publishedBy: publisher,
};

const idpPublication = {
  id: "pub-idp",
  module: "idp",
  indicator: "aderencia",
  version: 1,
  target: 0.9,
  result: 0.94,
  status: "OK",
  payload: {
    pontos: 4_053.7,
    peso: 0.35,
    meta: 90,
    resultado: 94,
    civil: 95,
    mecanica: 92,
    eia: 96,
    selectedYear: 2026,
    monthStart: 6,
    monthEnd: 11,
    totalLinhaBase: 1000,
    totalReal: 940,
    unidades: [{ n: "Sinop", v: 94 }],
    mensal: [
      { label: "Junho/2026", v: 89 },
      { label: "Julho/2026", v: 94 },
    ],
  },
  publishedAt: new Date("2026-08-02T12:00:00.000Z"),
  publishedBy: publisher,
};

const rncPublication = {
  id: "pub-rnc",
  module: "rnc",
  indicator: "dias_tratativa",
  version: 1,
  target: 15,
  result: 12.5,
  status: "OK",
  payload: {
    pontos: 1_158.2,
    peso: 0.1,
    meta: 15,
    resultado: 12.5,
    semestreResolvidas: 8,
    semestreTotal: 10,
    unidades: [{ n: "Sinop", v: 80 }],
    mensal: [
      { label: "Jun/2026", v: 14 },
      { label: "Jul/2026", v: 16 },
      { label: "Ago/2026", v: null },
    ],
    ofensores: [{ n: "Execução", pct: 100 }],
  },
  publishedAt: new Date("2026-08-03T12:00:00.000Z"),
  publishedBy: publisher,
};

const fiveSPublication = {
  id: "pub-5s",
  module: "cinco-s",
  indicator: "aderencia",
  version: 1,
  target: 90,
  result: 93,
  status: "OK",
  payload: {
    pontos: 1_158.2,
    peso: 0.1,
    meta: 90,
    resultado: 93,
    referenceYear: 2026,
    referenceMonth: 7,
    excludedUnits: ["SP", "CSC"],
    unidades: [{ n: "SNP", v: 93 }],
    mensal: [
      { label: "Jun/2026", v: 89, units: 5 },
      { label: "Jul/2026", v: 93, units: 5 },
    ],
  },
  publishedAt: new Date("2026-08-04T12:00:00.000Z"),
  publishedBy: publisher,
};

const accidentPublication = {
  id: "pub-accidents",
  module: "taxa-acidentes",
  indicator: "taxa",
  version: 1,
  target: 7.5,
  result: 7,
  status: "OK",
  payload: {
    pontos: 2_316.4,
    peso: 0.2,
    meta: 7.5,
    resultado: 7,
    metaFrequencia: 7.5,
    acidentesCaf: 3,
    desempenhoMes: 6,
    referenceYear: 2026,
    referenceMonth: 7,
    mensal: [
      { label: "Jun/2026", taxa: 8, caf: 2 },
      { label: "Jul/2026", taxa: 6, caf: 1 },
    ],
    unidades: [{ n: "SNP", v: 3 }],
  },
  publishedAt: new Date("2026-08-05T12:00:00.000Z"),
  publishedBy: publisher,
};

describe("Painel Geral por publicações", () => {
  it("converte rótulos abreviados e completos para a chave mensal", () => {
    expect(monthLabelToKey("Jun/2026")).toBe("2026-06");
    expect(monthLabelToKey("Julho/2026")).toBe("2026-07");
  });

  it("usa somente os meses presentes nos snapshots publicados", () => {
    const data = buildGeneralPanelData([rdoPublication]);
    expect(data.monthKeys).toEqual(["2026-06", "2026-07"]);
    const rdo = data.indicators.find((indicator) => indicator.key === "rdo");
    expect(rdo?.result).toBe(82);
    expect(rdo?.months.map((month) => month.pass)).toEqual([false, true]);
  });

  it("trata o IDP como Aderência Cronograma com meta de 90%", () => {
    const data = buildGeneralPanelData([idpPublication]);
    const cronograma = data.indicators.find((indicator) => indicator.key === "cronograma");
    expect(cronograma?.meta).toBe(90);
    expect(cronograma?.months.map((month) => month.pass)).toEqual([false, true]);
  });

  it("integra o RNC como indicador de menor valor", () => {
    const data = buildGeneralPanelData([rncPublication]);
    const rnc = data.indicators.find((indicator) => indicator.key === "rnc");
    expect(rnc?.months.map((month) => month.value)).toEqual([14, 16]);
    expect(rnc?.months.map((month) => month.pass)).toEqual([true, false]);
  });

  it("integra o 5S com meta de 90%", () => {
    const data = buildGeneralPanelData([fiveSPublication]);
    const fiveS = data.indicators.find((indicator) => indicator.key === "5s");
    expect(fiveS?.meta).toBe(90);
    expect(fiveS?.months.map((month) => month.pass)).toEqual([false, true]);
  });

  it("integra a Taxa de Acidentes como indicador de menor valor", () => {
    const data = buildGeneralPanelData([accidentPublication]);
    const accidents = data.indicators.find((indicator) => indicator.key === "taxa_acidentes");
    expect(accidents?.months.map((month) => month.value)).toEqual([8, 6]);
    expect(accidents?.months.map((month) => month.pass)).toEqual([false, true]);
  });

  it("calcula os pontos com os novos pesos", () => {
    const data = buildGeneralPanelData([
      rdoPublication,
      idpPublication,
      rncPublication,
      fiveSPublication,
      accidentPublication,
    ]);
    expect(data.pontuacaoPrevista).toBeCloseTo(SCORECARD_MONTHLY_POOL * 2);
    // Junho: apenas RNC atende (10%). Julho: RNC falha e os demais
    // indicadores atendem (90%). No total, equivale a 100% de um mês.
    expect(data.pontosRealizados).toBe(
      Math.round(SCORECARD_MONTHLY_POOL),
    );
  });

  it("normaliza o desempenho do RDO em relação à meta de 80%", () => {
    const rdo = SC_INDICATORS.find((indicator) => indicator.key === "rdo")!;
    expect(percentOfTarget(rdo, 80)).toBeCloseTo(100);
    expect(percentOfTarget(rdo, 84)).toBeCloseTo(105);
  });

  it("não mostra dados administrativos quando não há publicação", () => {
    const data = buildGeneralPanelData([]);
    expect(data.hasData).toBe(false);
    expect(data.pontosRealizados).toBe(0);
    expect(data.indicators.every((indicator) => !indicator.hasData)).toBe(true);
  });
});

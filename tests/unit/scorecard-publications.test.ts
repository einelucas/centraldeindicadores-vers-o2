import { describe, expect, it } from "vitest";
import {
  buildGeneralPanelData,
  latestPublishedValueForPeriod,
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

  it("recupera um mês em publicação anterior quando a versão mais nova não o contém", () => {
    const olderCompletePublication = {
      ...rdoPublication,
      active: false,
    };
    const newerPartialPublication = {
      ...rdoPublication,
      active: true,
      id: "pub-rdo-v2",
      version: 2,
      payload: {
        ...rdoPublication.payload,
        mensal: [{ label: "Jul/2026", v: 85 }],
      },
      publishedAt: new Date("2026-08-10T12:00:00.000Z"),
    };

    expect(
      latestPublishedValueForPeriod(
        "rdo",
        [newerPartialPublication, olderCompletePublication],
        2026,
        6,
      ),
    ).toBe(79);
    expect(
      latestPublishedValueForPeriod(
        "rdo",
        [olderCompletePublication, newerPartialPublication],
        2026,
        7,
      ),
    ).toBe(85);
  });

  it("não herda valor de publicações antigas quando o indicador não tem nenhuma publicação ativa", () => {
    // Indicador totalmente retratado: a fonte (ex.: RSOs do IDP) foi apagada e
    // nada foi republicado, então nenhuma publicação está ativa. Mesmo
    // havendo publicações antigas/de teste com valores para o período, elas
    // não devem "vazar" — o indicador deve aparecer como sem dados.
    const retractedPublication = { ...rdoPublication, active: false };

    expect(
      latestPublishedValueForPeriod("rdo", [retractedPublication], 2026, 6),
    ).toBeNull();
  });

  it("o Painel Geral usa só a publicação mais recente, sem herdar meses de versões antigas", () => {
    // Publicação antiga (desativada) cobre Jun+Jul. Uma republicação mais
    // nova ativa só reenvia Jul (ex.: correção de um dado que estava errado
    // em Jun, ou intervalo "De/Até" do IDP reduzido de propósito).
    // Mesclar as duas traria de volta dado velho/obsoleto — como aconteceu
    // de verdade com uma publicação antiga do IDP que "vazou" números de
    // teste para Set/Out/Nov no Painel Geral. Só a versão mais nova conta.
    const olderFullPublication = {
      ...rdoPublication,
      active: false,
    };
    const newerPartialPublication = {
      ...rdoPublication,
      active: true,
      id: "pub-rdo-v2",
      version: 2,
      payload: {
        ...rdoPublication.payload,
        resultado: 85,
        mensal: [{ label: "Jul/2026", v: 85 }],
      },
      publishedAt: new Date("2026-08-10T12:00:00.000Z"),
    };

    const data = buildGeneralPanelData([olderFullPublication, newerPartialPublication]);
    const rdo = data.indicators.find((indicator) => indicator.key === "rdo");

    // Junho só existia na versão antiga (desativada) — não deve aparecer.
    expect(data.monthKeys).toEqual(["2026-07"]);
    expect(rdo?.months.map((month) => month.value)).toEqual([85]);
    expect(rdo?.result).toBe(85);
  });

  it("ignora mês do IDP sem linha de base em vez de publicar 0%", () => {
    const publicationWithoutBaseline = {
      ...idpPublication,
      payload: {
        ...idpPublication.payload,
        totalLinhaBase: 0,
        totalReal: 0,
        resultado: 0,
        mensal: [
          {
            label: "Junho/2026",
            v: 0,
            linhaBase: 0,
            real: 0,
          },
        ],
      },
    };

    expect(
      latestPublishedValueForPeriod(
        "cronograma",
        [publicationWithoutBaseline],
        2026,
        6,
      ),
    ).toBeNull();
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

  it("usa a publicação mais recente DO PERÍODO pedido, não a mais recente entre todos os semestres", () => {
    // Publicação real de 2026 S2 (Jun-Nov/2026), mais antiga.
    const s2Publication = {
      ...rdoPublication,
      active: false,
    };
    // Alguém publicou 2027 S1 (Dez/2026-Mai/2027) depois — mais recente em
    // tempo real, mas de outro semestre. Sem filtrar por período, essa vira
    // "a mais recente" e o Painel Geral de 2026 S2 aparecia vazio mesmo com
    // dado real publicado para 2026 S2.
    const s1NextYearPublication = {
      ...rdoPublication,
      active: true,
      id: "pub-rdo-s1-2027",
      version: 2,
      payload: {
        ...rdoPublication.payload,
        resultado: 91,
        mensal: [{ label: "Dez/2026", v: 91 }],
      },
      publishedAt: new Date("2026-12-05T12:00:00.000Z"),
    };
    const publications = [s2Publication, s1NextYearPublication];

    // Sem período: comportamento antigo, pega a mais recente de qualquer semestre.
    const withoutPeriod = buildGeneralPanelData(publications);
    expect(withoutPeriod.monthKeys).toEqual(["2026-12"]);

    // Com o período de 2026 S2 selecionado no admin: tem que achar a
    // publicação de 2026 S2, não a de 2027 S1 que é mais recente em tempo real.
    const withS2Period = buildGeneralPanelData(publications, undefined, {
      startYear: 2026,
      startMonth: 6,
      endYear: 2026,
      endMonth: 11,
    });
    expect(withS2Period.monthKeys).toEqual(["2026-06", "2026-07"]);
    const rdo = withS2Period.indicators.find((indicator) => indicator.key === "rdo");
    expect(rdo?.result).toBe(82);
  });

  it("não mostra dados administrativos quando não há publicação", () => {
    const data = buildGeneralPanelData([]);
    expect(data.hasData).toBe(false);
    expect(data.pontosRealizados).toBe(0);
    expect(data.indicators.every((indicator) => !indicator.hasData)).toBe(true);
  });
});

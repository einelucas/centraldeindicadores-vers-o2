/** Tipos e constantes do módulo Scorecard 2026 (consolidado ponderado). */

/** Pontuação máxima do ciclo de seis meses. */
export const SCORECARD_MAX_POINTS = 11_582;

/**
 * Quantidade de meses de um ciclo padrão. O ciclo em si agora é livre
 * (ver `src/lib/period.ts`), mas o pool mensal continua fixo em 1/6 dos
 * 11.582 pontos — mesma regra de negócio da planilha original.
 */
export const SCORECARD_PERIOD_LENGTH = 6;

/** Pontuação máxima disponível em cada mês do ciclo. */
export const SCORECARD_MONTHLY_POOL = SCORECARD_MAX_POINTS / SCORECARD_PERIOD_LENGTH;

/** Definição de um indicador do scorecard. */
export interface ScorecardIndicator {
  key: string;
  label: string;
  peso: number;
  meta: number;
  direction: "higher" | "lower";
  unit: string;
  source: { module: string; indicator: string } | null;
}

/** Linha calculada do scorecard para um mês. */
export interface ScorecardRow {
  key: string;
  label: string;
  peso: number;
  meta: number;
  direction: "higher" | "lower";
  unit: string;
  value: number | null;
  pass: boolean;
  pontos: number;
  pontosPossiveis: number;
  hasValue: boolean;
}

/** Resultado consolidado de um mês do scorecard. */
export interface ScorecardResult {
  rows: ScorecardRow[];
  totalPontos: number;
  totalPeso: number;
  pontosPossiveisMes: number;
  atendimentoMes: number;
}

/**
 * Indicadores, pesos e metas definidos no alinhamento vigente.
 * A soma dos cinco pesos é exatamente 100%.
 */
export const SC_INDICATORS: ScorecardIndicator[] = [
  {
    key: "rdo",
    label: "Aprovação RDO",
    peso: 25,
    meta: 80,
    direction: "higher",
    unit: "%",
    source: { module: "rdo", indicator: "aprovacao" },
  },
  {
    key: "cronograma",
    label: "Aderência Cronograma",
    peso: 35,
    meta: 90,
    direction: "higher",
    unit: "%",
    source: { module: "idp", indicator: "aderencia" },
  },
  {
    key: "rnc",
    label: "RNC",
    peso: 10,
    meta: 15,
    direction: "lower",
    unit: "dias",
    source: { module: "rnc", indicator: "dias_tratativa" },
  },
  {
    key: "5s",
    label: "5S",
    peso: 10,
    meta: 90,
    direction: "higher",
    unit: "%",
    source: { module: "cinco-s", indicator: "aderencia" },
  },
  {
    key: "taxa_acidentes",
    label: "Taxa de Acidentes",
    peso: 20,
    meta: 7.5,
    direction: "lower",
    unit: "",
    source: { module: "taxa-acidentes", indicator: "taxa" },
  },
];

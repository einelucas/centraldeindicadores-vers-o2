/** Tipos do módulo IDP (Índice de Desempenho por Disciplina). */

/** Registro IDP normalizado, pronto para chave/hash e persistência. */
export interface IdpNormalizedRecord {
  unit: string; // projeto/unidade (derivado do nome do arquivo)
  year: number;
  month: number; // 1..12
  disciplina: string;
  custoLinhaBase: number;
  custoReal: number;
  raw: Record<string, unknown>;
}

/** Agregado (linha de base vs. real) com aderência derivada. */
export interface IdpAggregate {
  name: string;
  custoLinhaBase: number;
  custoReal: number;
  aderencia: number;
}

/** Resultado consolidado básico do IDP. */
export interface IdpResult {
  threshold: number;
  totalLinhaBase: number;
  totalReal: number;
  aderenciaGeral: number;
  units: IdpAggregate[];
  disciplinas: IdpAggregate[];
}

export interface IdpDisciplineGroupAggregate {
  key: "civil" | "mecanica" | "eia";
  label: string;
  codes: number[];
  custoLinhaBase: number;
  custoReal: number;
  aderencia: number;
  hasData: boolean;
}

export interface IdpMonthlyAggregate {
  year: number;
  month: number;
  label: string;
  custoLinhaBase: number;
  custoReal: number;
  aderencia: number;
}

export interface IdpUnitDetailMonth {
  year: number;
  month: number;
  label: string;
}

export interface IdpUnitDetailValue {
  year: number;
  month: number;
  custoLinhaBase: number;
  custoReal: number;
  aderencia: number;
}

export interface IdpUnitDetailRow {
  disciplina: string;
  values: IdpUnitDetailValue[];
  totalLinhaBase: number;
  totalReal: number;
  aderencia: number;
}

export interface IdpUnitDetail {
  unit: string;
  months: IdpUnitDetailMonth[];
  rows: IdpUnitDetailRow[];
}

export type IdpSemesterKey = "dec-may" | "jun-nov";

/**
 * Quebra mensal consolidada por disciplina, somando todas as unidades.
 *
 * O ano de referência é sempre o ano escolhido no filtro geral do módulo:
 *  - dec-may: Dezembro do ano anterior até Maio do ano selecionado;
 *  - jun-nov: Junho até Novembro do ano selecionado.
 */
export interface IdpSemesterDisciplineDetail {
  key: IdpSemesterKey;
  label: string;
  periodLabel: string;
  referenceYear: number;
  months: IdpUnitDetailMonth[];
  rows: IdpUnitDetailRow[];
  totalLinhaBase: number;
  totalReal: number;
  aderencia: number;
}

/** Resultado completo usado pela Administração e pela publicação. */
export interface IdpDetailedResult extends IdpResult {
  selectedYear: number;
  monthStart: number;
  monthEnd: number;
  monthly: IdpMonthlyAggregate[];
  groups: {
    civil: IdpDisciplineGroupAggregate;
    mecanica: IdpDisciplineGroupAggregate;
    eia: IdpDisciplineGroupAggregate;
  };
  unitDetails: IdpUnitDetail[];
}

/** Meta oficial de aderência ao cronograma: 90%. */
export const IDP_DEFAULT_TARGET = 0.9;

/** Participação do IDP no ciclo de 11.582 pontos. */
export const IDP_SCORECARD_WEIGHT = 0.35;
export const IDP_SCORECARD_POINTS = 4_053.7;

/** Janela semestral padrão do HTML: Junho a Novembro. */
export const IDP_DEFAULT_MONTH_START = 6;
export const IDP_DEFAULT_MONTH_END = 11;

/** Colunas obrigatórias (normalizadas). Migrado de REQUIRED_IDP_COLS. */
export const REQUIRED_IDP_COLS = [
  "ano",
  "mês",
  "disciplina_tarefa",
  "custo_da_linha_de_base",
  "custo_real",
] as const;

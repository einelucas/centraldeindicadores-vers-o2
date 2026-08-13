/** Tipos do módulo RNC (Registro de Não Conformidade). */

import type { PeriodRange } from "@/lib/period";

export interface RncNormalizedRecord {
  statusRnc: string;
  unidade: string;
  dataCriacao: Date;
  dataSolucao: Date | null;
  tempoTratativa: number | null;
  ofensor: string;
  year: number;
  month: number; // 1..12 (mês de criação)
  raw: Record<string, unknown>;
}

/** Agregado por mês de criação (coorte). */
export interface RncMonthAggregate {
  label: string;
  year: number;
  month: number; // 0-based, como no HTML de referência
  chamados: number;
  solucionados: number;
  diasMedios: number | null;
  dentroMeta: boolean | null;
}

/** Agregado por unidade. */
export interface RncUnitAggregate {
  name: string;
  criadas: number;
  tratadas: number;
  aderencia: number;
  /** Média apenas das RNCs solucionadas com tempo de tratativa numérico. */
  diasMedios: number | null;
  /** Mediana da mesma amostra usada em diasMedios. */
  diasMedianos: number | null;
  tratativasComTempo: number;
  maiorTempoTratativa: number | null;
  principalOfensor: string | null;
  principalOfensorCount: number;
  excluded: boolean;
}

/** Agregado por ofensor. */
export interface RncOfensorAggregate {
  name: string;
  count: number;
  pct: number;
}

/** Resultado consolidado do RNC. */
export interface RncResult {
  metaDias: number;
  excludedUnits: string[];
  period: PeriodRange | null;
  totalCriadas: number;
  totalTratadas: number;
  aderenciaTotal: number;
  /** Média aritmética simples dos "dias médios" mensais válidos (cada mês pesa 1). */
  resultadoDias: number | null;
  months: RncMonthAggregate[];
  units: RncUnitAggregate[];
  ofensores: RncOfensorAggregate[];
}

/** Meta padrão preservada do HTML. */
export const RNC_DEFAULT_MAX_DIAS = 15;

/** Participação do RNC no ciclo de 11.582 pontos. */
export const RNC_SCORECARD_POINTS = 1_158.2;
export const RNC_SCORECARD_WEIGHT = 0.1;

/** Colunas obrigatórias normalizadas. */
export const REQUIRED_RNC_COLS = [
  "status_rnc",
  "unidade",
  "data_de_criação",
  "data_de_solução",
  "tempo_de_tratativa",
  "ofensor",
] as const;

/** Status que conta como tratada. */
export const RNC_STATUS_TRATADA = "TRATADA";

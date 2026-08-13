/** Tipos do módulo RDO (Relatório Diário de Obra). */

import type { PeriodRange } from "@/lib/period";

/** Registro RDO normalizado, pronto para chave/hash e persistência. */
export interface RdoNormalizedRecord {
  dataReferencia: Date;
  empresaNome: string;
  statusDescricao: string;
  relatorioId: string | null;
  grupo: string | null;
  disciplina: string | null;
  year: number;
  month: number; // 1..12
  /** Linha original (headers normalizados) para exibição/auditoria. */
  raw: Record<string, unknown>;
}

/** Agregado por unidade. */
export interface RdoUnitAggregate {
  name: string;
  emitidos: number;
  aprovados: number;
  aderencia: number;
  excluded: boolean;
}

/** Agregado por mês. */
export interface RdoMonthAggregate {
  label: string;
  year: number;
  month: number; // 0-based (Date.getMonth), como no HTML
  emitidos: number;
  aprovados: number;
  aderencia: number;
}

/** Resultado consolidado do RDO. */
export interface RdoResult {
  threshold: number;
  excludedUnits: string[];
  period: PeriodRange | null;
  totalEmitidos: number;
  totalAprovados: number;
  totalRevisar: number;
  totalPreenchendo: number;
  units: RdoUnitAggregate[];
  unitAvg: number;
  months: RdoMonthAggregate[];
}

/** Meta oficial de aprovação do RDO: 80%. */
export const RDO_DEFAULT_TARGET = 0.8;

/** Participação do RDO no ciclo de 11.582 pontos. */
export const RDO_SCORECARD_WEIGHT = 0.25;
export const RDO_SCORECARD_POINTS = 2_895.5;

/** Colunas obrigatórias (normalizadas). Migrado de REQUIRED_RDO_COLS. */
export const REQUIRED_RDO_COLS = ["data", "status_descricao", "empresa_nome"] as const;

/** Status reconhecidos pelo cálculo (texto exato do HTML). */
export const RDO_STATUS = {
  APROVADO: "Aprovado",
  REVISAR: "Revisar Relatório",
  PREENCHENDO: "Preenchendo Relatório",
} as const;

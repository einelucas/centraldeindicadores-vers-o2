/** Tipos do módulo IDP baseado nos Relatórios Semanais de Obra (RSO). */

export const IDP_DISC_NAMES = [
  "01 - Civil",
  "02 - Mecânica",
  "03 - Mecânica de Rotativos",
  "04 - Elétrica",
  "05 - Instrumentação",
  "06 - Automação",
  "07 - Isolamento",
  "08 - Válvulas Manuais",
] as const;

export type IdpDisciplineName = (typeof IDP_DISC_NAMES)[number];

export interface IdpRsoAreaValue {
  area: string;
  prevAcum: number;
  realAcum: number;
}

export type IdpRsoDisciplineData = Record<string, IdpRsoAreaValue[]>;

export interface IdpExecutionPhase {
  label: string;
  prevAcum: number;
  realAcum: number;
}

export type IdpReferenceSource = "PDF_MES_REF" | "MANUAL" | "UNRESOLVED";

/**
 * Um registro representa uma versão semanal completa do RSO de uma unidade.
 * O número do RSO identifica a versão; competência, período e emissão são
 * dimensões independentes e nunca substituem umas às outras silenciosamente.
 */
export interface IdpNormalizedRecord {
  id?: string;
  businessKey?: string;
  updatedAt?: string;

  unit: string;
  detectedUnit: string | null;
  unitAdjusted: boolean;

  rsoNumero: number | null;
  detectedRsoNumero: number | null;
  rsoAdjusted: boolean;

  referenceYear: number | null;
  referenceMonth: number | null;
  detectedReferenceYear: number | null;
  detectedReferenceMonth: number | null;
  referenceSource: IdpReferenceSource;
  referenceOriginalText: string | null;
  referenceAdjusted: boolean;

  periodStart: string | null;
  periodEnd: string | null;
  emissionDate: string | null;

  fileName: string;
  areas: string[];
  discData: IdpRsoDisciplineData;
  execucaoFases: IdpExecutionPhase[];
  raw: Record<string, unknown>;
}

export interface IdpUnitExecutionRow {
  sourceId?: string;
  unit: string;
  excluded: boolean;
  rsoNumero: number;
  referenceYear: number;
  referenceMonth: number;
  referenceSource: IdpReferenceSource;
  referenceOriginalText: string | null;
  referenceAdjusted: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  emissionDate: string | null;
  fileName: string;
  prevAcum: number;
  realAcum: number;
  aderencia: number;
  nFases: number;
  fases: IdpExecutionPhase[];
}

export interface IdpDisciplineUnitGroup {
  unit: string;
  entries: IdpRsoAreaValue[];
  prevAvg: number;
  realAvg: number;
  aderencia: number;
}

export interface IdpDisciplineAggregate {
  discipline: string;
  entries: Array<IdpRsoAreaValue & { unit: string }>;
  prevAvg: number | null;
  realAvg: number | null;
  aderencia: number | null;
  unitGroups: IdpDisciplineUnitGroup[];
}

export interface IdpUnitDetailDiscipline {
  discipline: string;
  n: number;
  prevAvg: number;
  realAvg: number;
  aderencia: number;
  areas: IdpRsoAreaValue[];
}

export interface IdpUnitDetail {
  unit: string;
  disciplines: IdpUnitDetailDiscipline[];
}

export interface IdpMonthlyAggregate {
  year: number;
  month: number;
  label: string;
  aderencia: number | null;
  activeDocuments: number;
  totalPrevistoMedio: number;
  totalRealMedio: number;
}

export interface IdpDetailedResult {
  threshold: number;
  excludedUnits: string[];
  selectedYear: number;
  selectedMonth: number;
  historyStartYear: number;
  historyMonthStart: number;
  historyEndYear: number;
  historyMonthEnd: number;
  aderenciaGeral: number;
  unitRows: IdpUnitExecutionRow[];
  disciplineRows: IdpDisciplineAggregate[];
  unitDetails: IdpUnitDetail[];
  unitNames: string[];
  activeDocuments: number;
  totalPrevistoMedio: number;
  totalRealMedio: number;
  monthly: IdpMonthlyAggregate[];
}

/** Meta oficial de aderência ao cronograma. */
export const IDP_DEFAULT_TARGET = 0.9;

/** Participação do IDP no ciclo de 11.582 pontos. */
export const IDP_SCORECARD_WEIGHT = 0.35;
export const IDP_SCORECARD_POINTS = 4_053.7;

/** Faixa histórica exibida por padrão. */
export const IDP_DEFAULT_MONTH_START = 1;
export const IDP_DEFAULT_MONTH_END = 12;

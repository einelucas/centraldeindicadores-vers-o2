/** Tipos do módulo IDP — avanço físico extraído dos relatórios RSO. */

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

export interface IdpRsoPhase {
  prevAcum: number;
  realAcum: number;
}

export interface IdpRsoAreaValue extends IdpRsoPhase {
  area: string;
}

export type IdpRsoDisciplineData = Record<string, IdpRsoAreaValue[]>;

/** Um documento RSO normalizado, pronto para chave/hash e persistência. */
export interface IdpNormalizedRecord {
  id?: string;
  businessKey?: string;
  unit: string;
  rsoNumero: number | null;
  /** Competência do relatório no formato YYYY-MM-DD. */
  referenceDate: string;
  fileName: string;
  areas: string[];
  discData: IdpRsoDisciplineData;
  execucaoFases: IdpRsoPhase[];
  raw: Record<string, unknown>;
  updatedAt?: string;
}

export interface IdpUnitAggregate {
  sourceId?: string;
  unit: string;
  rsoNumero: number | null;
  referenceDate: string;
  fileName: string;
  prevAcum: number;
  realAcum: number;
  aderencia: number;
  nFases: number;
  fases: IdpRsoPhase[];
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

export interface IdpUnitDisciplineAggregate {
  discipline: string;
  n: number;
  prevAvg: number;
  realAvg: number;
  aderencia: number;
  areas: IdpRsoAreaValue[];
}

export interface IdpUnitDetail {
  unit: string;
  disciplines: IdpUnitDisciplineAggregate[];
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

/** Resultado completo usado pela Administração, PDF e publicação. */
export interface IdpDetailedResult {
  threshold: number;
  selectedYear: number;
  monthStart: number;
  monthEnd: number;
  aderenciaGeral: number;
  unitRows: IdpUnitAggregate[];
  disciplineRows: IdpDisciplineAggregate[];
  unitDetails: IdpUnitDetail[];
  unitNames: string[];
  activeDocuments: number;
  totalPrevistoMedio: number;
  totalRealMedio: number;
  monthly: IdpMonthlyAggregate[];
}

/** Meta oficial da lógica RSO extraída do HTML base: 98%. */
export const IDP_DEFAULT_TARGET = 0.98;

/** Participação do IDP no ciclo de 11.582 pontos. */
export const IDP_SCORECARD_WEIGHT = 0.35;
export const IDP_SCORECARD_POINTS = 4_053.7;

export const IDP_DEFAULT_MONTH_START = 1;
export const IDP_DEFAULT_MONTH_END = 12;

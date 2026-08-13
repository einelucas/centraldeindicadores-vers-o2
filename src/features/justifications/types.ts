export const JUSTIFICATION_MODULES = ["rdo", "idp", "rnc", "cinco-s", "taxa-acidentes"] as const;

export type JustificationModule = (typeof JUSTIFICATION_MODULES)[number];

export interface JustificationEvidenceItem {
  label: string;
  value: string;
  detail?: string;
}

export interface JustificationSuggestion {
  module: JustificationModule;
  year: number;
  month: number;
  result: number | null;
  target: number | null;
  status: "BELOW_TARGET" | "ON_TARGET" | "NO_DATA";
  evidence: JustificationEvidenceItem[];
  suggestedText: string;
  sourceImport: { id: string; importedAt: string | null } | null;
}

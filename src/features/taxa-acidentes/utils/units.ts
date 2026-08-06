import { collapseSpaces, normalizeForMatch } from "@/lib/normalization";

export interface AccidentUnitDefinition {
  code: string;
  name: string;
  label: string;
}

export const ACCIDENT_UNITS: readonly AccidentUnitDefinition[] = [
  {
    code: "LEM",
    name: "LUIS EDUARDO MAGALHÃES",
    label: "LEM - LUIS EDUARDO MAGALHÃES",
  },
  { code: "MTU", name: "NOVA MUTUM", label: "MTU - NOVA MUTUM" },
  { code: "RVD", name: "RIO VERDE", label: "RVD - RIO VERDE" },
  { code: "BLS", name: "BALSAS", label: "BLS - BALSAS" },
  { code: "SNP", name: "SINOP", label: "SNP - SINOP" },
  { code: "DRD", name: "DOURADOS", label: "DRD - DOURADOS" },
  { code: "RDN", name: "RONDONOPOLIS", label: "RDN - RONDONOPOLIS" },
  { code: "SDR", name: "SIDROLANDIA", label: "SDR - SIDROLANDIA" },
] as const;

const UNIT_BY_CODE = new Map<string, AccidentUnitDefinition>(
  ACCIDENT_UNITS.map((unit) => [unit.code, unit]),
);
const UNIT_ORDER = new Map<string, number>(
  ACCIDENT_UNITS.map((unit, index) => [unit.code, index]),
);

/**
 * Converte sigla, nome completo ou rótulo combinado para a sigla oficial.
 * Unidades não cadastradas continuam disponíveis em caixa alta.
 */
export function normalizeAccidentUnitCode(value: unknown): string {
  const raw = collapseSpaces(String(value ?? ""));
  if (!raw) return "";

  const normalized = normalizeForMatch(raw);
  const tokens = normalized.split(" ");

  for (const unit of ACCIDENT_UNITS) {
    const normalizedName = normalizeForMatch(unit.name);
    if (
      normalized === unit.code ||
      normalized === normalizedName ||
      normalized === `${unit.code} ${normalizedName}` ||
      normalized === `${normalizedName} ${unit.code}` ||
      tokens.includes(unit.code) ||
      normalized.includes(normalizedName)
    ) {
      return unit.code;
    }
  }

  return raw.toUpperCase();
}

/** Exibe unidades conhecidas no padrão "SIGLA - NOME COMPLETO". */
export function formatAccidentUnitLabel(value: unknown): string {
  const code = normalizeAccidentUnitCode(value);
  return UNIT_BY_CODE.get(code)?.label ?? code;
}

/** Mantém as unidades oficiais na ordem operacional informada. */
export function compareAccidentUnits(a: unknown, b: unknown): number {
  const codeA = normalizeAccidentUnitCode(a);
  const codeB = normalizeAccidentUnitCode(b);
  const orderA = UNIT_ORDER.get(codeA) ?? Number.MAX_SAFE_INTEGER;
  const orderB = UNIT_ORDER.get(codeB) ?? Number.MAX_SAFE_INTEGER;

  return (
    orderA - orderB ||
    formatAccidentUnitLabel(codeA).localeCompare(
      formatAccidentUnitLabel(codeB),
      "pt-BR",
    )
  );
}

import { collapseSpaces, normalizeForMatch } from "@/lib/normalization";

export interface RncUnitDefinition {
  code: string;
  name: string;
  label: string;
}

export const RNC_UNITS: readonly RncUnitDefinition[] = [
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

const UNIT_BY_CODE = new Map(RNC_UNITS.map((unit) => [unit.code, unit]));

/**
 * Converte sigla, nome completo ou rótulo combinado para a sigla oficial.
 * Valores não cadastrados continuam disponíveis, mas são estabilizados em caixa alta.
 */
export function normalizeRncUnitCode(value: unknown): string {
  const raw = collapseSpaces(String(value ?? ""));
  if (!raw) return "";

  const normalized = normalizeForMatch(raw);
  const tokens = normalized.split(" ");

  for (const unit of RNC_UNITS) {
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
export function formatRncUnitLabel(value: unknown): string {
  const code = normalizeRncUnitCode(value);
  return UNIT_BY_CODE.get(code)?.label ?? code;
}

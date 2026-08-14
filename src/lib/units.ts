/**
 * Cadastro canônico das unidades operacionais, compartilhado por todos os
 * módulos (RDO, RNC, 5S, IDP, Taxa de Acidentes). Uma mesma unidade pode
 * aparecer nos documentos de origem de formas diferentes — sigla ("RVD"),
 * nome completo ("Rio Verde"), caixa alta/baixa, ou com prefixos soltos — e
 * deve sempre ser reconhecida e exibida como a mesma unidade, pelo nome
 * completo por extenso.
 */

import { collapseSpaces, normalizeForMatch } from "@/lib/normalization";

export interface UnitDefinition {
  code: string;
  name: string;
}

export const UNITS: readonly UnitDefinition[] = [
  { code: "LEM", name: "LUIS EDUARDO MAGALHÃES" },
  { code: "MTU", name: "NOVA MUTUM" },
  { code: "RVD", name: "RIO VERDE" },
  { code: "BLS", name: "BALSAS" },
  { code: "SNP", name: "SINOP" },
  { code: "DRD", name: "DOURADOS" },
  { code: "RDN", name: "RONDONOPOLIS" },
  { code: "SDR", name: "SIDROLANDIA" },
] as const;

const UNIT_BY_CODE = new Map<string, UnitDefinition>(UNITS.map((unit) => [unit.code, unit]));
const UNIT_ORDER = new Map<string, number>(UNITS.map((unit, index) => [unit.code, index]));

/**
 * Converte sigla, nome completo (em qualquer caixa/acentuação) ou rótulo
 * combinado para a sigla oficial. Unidades fora do cadastro continuam
 * disponíveis, estabilizadas em caixa alta.
 */
export function normalizeUnitCode(value: unknown): string {
  const raw = collapseSpaces(String(value ?? ""));
  if (!raw) return "";

  const normalized = normalizeForMatch(raw);
  const tokens = normalized.split(" ");

  for (const unit of UNITS) {
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

/** Exibe o nome completo por extenso da unidade — nunca a sigla nem prefixos soltos. */
export function formatUnitLabel(value: unknown): string {
  const code = normalizeUnitCode(value);
  return UNIT_BY_CODE.get(code)?.name ?? code;
}

/** Mantém as unidades oficiais na ordem operacional cadastrada. */
export function compareUnits(a: unknown, b: unknown): number {
  const codeA = normalizeUnitCode(a);
  const codeB = normalizeUnitCode(b);
  const orderA = UNIT_ORDER.get(codeA) ?? Number.MAX_SAFE_INTEGER;
  const orderB = UNIT_ORDER.get(codeB) ?? Number.MAX_SAFE_INTEGER;

  return orderA - orderB || formatUnitLabel(codeA).localeCompare(formatUnitLabel(codeB), "pt-BR");
}

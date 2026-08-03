/** Configuração das disciplinas desconsideradas no IDP. */

import type { Prisma } from "@prisma/client";
import type { IdpNormalizedRecord } from "@/features/idp/types";

export const IDP_EXCLUDED_DISCIPLINES_SETTING_KEY =
  "idp.excludedDisciplines" as const;

export const IDP_DEFAULT_EXCLUDED_DISCIPLINES = [
  "10 _ Fornecimentos",
  "09 _ Projetos",
] as const;

interface AppSettingReader {
  appSetting: {
    findUnique(args: {
      where: { key: string };
      select: { value: true };
    }): Promise<{ value: Prisma.JsonValue } | null>;
  };
}

/**
 * Normaliza apenas para comparação. Mantém o valor original na configuração e
 * nos registros, mas tolera diferenças de caixa, acentuação, hífen e sublinhado.
 */
export function normalizeIdpDisciplineName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[_–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Converte o valor salvo no AppSetting em uma lista limpa e sem duplicatas. */
export function parseIdpExcludedDisciplines(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\r\n,;]+/)
      : [];

  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of source) {
    const label = String(item ?? "").trim();
    const normalized = normalizeIdpDisciplineName(label);
    if (!label || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(label);
  }

  return result;
}

export function isIdpDisciplineExcluded(
  disciplina: string,
  excludedDisciplines: readonly string[],
): boolean {
  const normalized = normalizeIdpDisciplineName(disciplina);
  if (!normalized) return false;

  return excludedDisciplines.some(
    (excluded) => normalizeIdpDisciplineName(excluded) === normalized,
  );
}

export function filterIdpExcludedDisciplines<T extends Pick<IdpNormalizedRecord, "disciplina">>(
  records: readonly T[],
  excludedDisciplines: readonly string[],
): T[] {
  if (!excludedDisciplines.length) return [...records];
  return records.filter(
    (record) => !isIdpDisciplineExcluded(record.disciplina, excludedDisciplines),
  );
}

/** Lê a configuração; na ausência dela, aplica as exclusões oficiais padrão. */
export async function loadIdpExcludedDisciplines(
  db: AppSettingReader,
): Promise<string[]> {
  const setting = await db.appSetting.findUnique({
    where: { key: IDP_EXCLUDED_DISCIPLINES_SETTING_KEY },
    select: { value: true },
  });

  if (!setting) return [...IDP_DEFAULT_EXCLUDED_DISCIPLINES];
  return parseIdpExcludedDisciplines(setting.value);
}

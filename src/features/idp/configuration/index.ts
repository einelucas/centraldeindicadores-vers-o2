/** Configuração das disciplinas desconsideradas no consolidado RSO do IDP. */

import type { Prisma } from "@prisma/client";

export const IDP_EXCLUDED_DISCIPLINES_SETTING_KEY = "idp.excludedDisciplines" as const;
export const IDP_DEFAULT_EXCLUDED_DISCIPLINES: readonly string[] = [];

interface AppSettingReader {
  appSetting: {
    findUnique(args: {
      where: { key: string };
      select: { value: true };
    }): Promise<{ value: Prisma.JsonValue } | null>;
  };
}

export function normalizeIdpDisciplineName(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[_–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  return excludedDisciplines.some(
    (excluded) => normalizeIdpDisciplineName(excluded) === normalized,
  );
}

export function filterIdpDisciplineNames<T extends string>(
  disciplines: readonly T[],
  excludedDisciplines: readonly string[],
): T[] {
  return disciplines.filter(
    (discipline) => !isIdpDisciplineExcluded(discipline, excludedDisciplines),
  );
}

export async function loadIdpExcludedDisciplines(db: AppSettingReader): Promise<string[]> {
  const setting = await db.appSetting.findUnique({
    where: { key: IDP_EXCLUDED_DISCIPLINES_SETTING_KEY },
    select: { value: true },
  });
  if (!setting) return [...IDP_DEFAULT_EXCLUDED_DISCIPLINES];
  return parseIdpExcludedDisciplines(setting.value);
}

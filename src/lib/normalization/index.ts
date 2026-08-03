/**
 * Normalização de dados importados.
 * Regras migradas do HTML original (funções normHeader, normalizeRows,
 * normalizeForMatch, normalizeExact, normalizeUnitName).
 *
 * Objetivo: gerar valores estáveis para comparação (business key / content hash)
 * sem descaracterizar o dado exibido ao usuário.
 */

/** Colapsa espaços e apara as pontas. */
export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Normaliza um cabeçalho de coluna: minúsculas, espaços viram underscore.
 * Equivalente a normHeader() do HTML.
 */
export function normHeader(header: unknown): string {
  return String(header ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/**
 * Aplica normHeader a todas as chaves de cada linha bruta.
 * Equivalente a normalizeRows() do HTML.
 */
export function normalizeRows(
  rawRows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return rawRows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
      out[normHeader(key)] = row[key];
    }
    return out;
  });
}

/**
 * Normaliza texto para COMPARAÇÃO em business keys: caixa alta, espaços
 * colapsados. Preserva acentos de propósito — remover acentos
 * indiscriminadamente pode gerar colisões entre entidades/unidades.
 */
export function normalizeForKey(value: unknown): string {
  if (value === null || value === undefined) return "";
  return collapseSpaces(String(value)).toUpperCase();
}

/**
 * Normalização "exata" para matching de nomes (entidades/unidades):
 * remove acentos, pontuação leve e caixa. Usada apenas em busca fuzzy,
 * nunca como identidade única de registro.
 */
export function normalizeForMatch(value: unknown): string {
  return collapseSpaces(String(value ?? ""))
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Converte string vazia, "-", null e undefined em null; caso contrário retorna trim. */
export function nullIfEmpty(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const t = String(value).trim();
  if (t === "" || t === "-") return null;
  return t;
}

/**
 * Parsing/formatação de números e moeda brasileira.
 * Regras migradas do HTML (parseBRNumberOrNull, fmtCurrency, fmtPct, toNumberOrZero).
 */

/**
 * Converte número brasileiro ("1.234,56") em Number, ou null se inválido/vazio.
 * Equivalente a parseBRNumberOrNull() do HTML.
 */
export function parseBRNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const t = String(value).trim();
  if (t === "" || t === "-") return null;
  const n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

/** Converte para número ou 0. Equivalente a toNumberOrZero() do HTML. */
export function toNumberOrZero(value: unknown): number {
  const n = parseBRNumberOrNull(value);
  return n === null ? 0 : n;
}

/** Percentual arredondado ("76%"). Equivalente a fmtPct() do HTML. */
export function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return Math.round(value * 100) + "%";
}

/** Moeda BRL. Equivalente a fmtCurrency() do HTML. */
export function fmtCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

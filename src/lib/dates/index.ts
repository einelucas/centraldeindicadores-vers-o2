/**
 * Parsing e formatação de datas. Regras migradas do HTML
 * (parseFlexDate, excelSerialToDate, fmtDateBR).
 */

/** Serial do Excel (epoch 30/12/1899) para Date. Equivalente a excelSerialToDate(). */
export function excelSerialToDate(serial: number): Date {
  if (!Number.isFinite(serial)) {
    return new Date(Number.NaN);
  }

  // O serial do Excel representa uma data sem fuso horário. Criar o Date
  // diretamente a partir do timestamp UTC faz a data voltar um dia em fusos
  // negativos, como o horário de Brasília. Calculamos em UTC e recriamos a
  // mesma data/hora no fuso local para preservar o dia exibido na planilha.
  const totalMilliseconds = Math.round(serial * 86_400_000);
  const utcDate = new Date(Date.UTC(1899, 11, 30) + totalMilliseconds);

  return new Date(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate(),
    utcDate.getUTCHours(),
    utcDate.getUTCMinutes(),
    utcDate.getUTCSeconds(),
    utcDate.getUTCMilliseconds(),
  );
}

/**
 * Aceita Date, serial do Excel (number) ou string em DD/MM/YYYY,
 * YYYY-MM-DD ou formato livre. Retorna null se não parseável.
 * Equivalente a parseFlexDate() do HTML.
 */
export function parseFlexDate(value: unknown): Date | null {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === "number") return excelSerialToDate(value);
  if (typeof value === "string") {
    const s = value.trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/** Data em ISO (YYYY-MM-DD) usada para chaves. Retorna "" se inválida. */
export function toIsoDateKey(value: unknown): string {
  const d = parseFlexDate(value);
  if (!d) return "";
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

/** Formata data no padrão brasileiro. Equivalente a fmtDateBR(). */
export function fmtDateBR(d: Date | null | undefined): string {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return "—";
  return (
    String(d.getDate()).padStart(2, "0") +
    "/" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "/" +
    d.getFullYear()
  );
}

/**
 * Formata data + hora no padrão BR (DD/MM/AAAA HH:MM). Aceita Date, string ISO
 * ou null. Útil para exibir timestamps vindos da API (que chegam como string).
 */
export function fmtDateTimeBR(
  value: Date | string | null | undefined,
): string {
  if (value === null || value === undefined) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "—";
  return (
    fmtDateBR(d) +
    " " +
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}

export const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

/** Nomes completos dos meses em português (migrado de MONTH_PT do HTML). */
export const MONTH_NAMES_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

/**
 * Índice do mês (1..12) a partir do nome em português. Aceita nome completo
 * ("Março") ou abreviação ("Mar"). Retorna 0 se não reconhecer.
 * Migrado de monthIndexPt() do HTML (que era 0-based e retornava -1); aqui é
 * 1-based e retorna 0 para "não encontrado", consistente com o resto do código.
 */
export function monthIndexPt(name: unknown): number {
  const n = String(name ?? "").trim().toLowerCase();
  if (!n) return 0;
  const full = MONTH_NAMES_FULL.findIndex((m) => m.toLowerCase() === n);
  if (full !== -1) return full + 1;
  const abbr = MONTH_NAMES.findIndex((m) => m.toLowerCase() === n);
  if (abbr !== -1) return abbr + 1;
  // Aceita também número textual ("3", "03").
  const num = parseInt(n, 10);
  if (!isNaN(num) && num >= 1 && num <= 12) return num;
  return 0;
}

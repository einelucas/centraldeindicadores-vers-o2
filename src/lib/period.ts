/**
 * Intervalo de período livre (de mês/ano até mês/ano), compartilhado por
 * todos os módulos. Representa "sem restrição" como `null` — nunca como um
 * intervalo aberto implícito — para que cada camada (query string, corpo de
 * publicação, payload publicado) trate a ausência de filtro de forma
 * explícita e serializável.
 *
 * Suporta intervalos que atravessam a virada do ano civil (ex.: dezembro de
 * um ano até maio do ano seguinte), que é o caso real do segundo semestre
 * operacional da empresa.
 */

import { MONTH_NAMES } from "@/lib/dates";

export interface PeriodRange {
  startYear: number;
  startMonth: number; // 1-12
  endYear: number;
  endMonth: number; // 1-12
}

export interface MonthReference {
  year: number;
  month: number;
}

/** Índice inteiro contínuo de um mês, usado para comparar/ordenar intervalos mesmo entre anos. */
export function toMonthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

function fromMonthIndex(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

/** Troca início/fim se o intervalo estiver invertido. */
export function normalizePeriodRange(range: PeriodRange): PeriodRange {
  const startIdx = toMonthIndex(range.startYear, range.startMonth);
  const endIdx = toMonthIndex(range.endYear, range.endMonth);
  if (startIdx <= endIdx) return range;
  return {
    startYear: range.endYear,
    startMonth: range.endMonth,
    endYear: range.startYear,
    endMonth: range.startMonth,
  };
}

/** `true` sempre que `range` for `null`/`undefined` (nenhuma restrição = "Tudo"). */
export function isWithinPeriodRange(
  year: number,
  month: number,
  range: PeriodRange | null | undefined,
): boolean {
  if (!range) return true;
  const normalized = normalizePeriodRange(range);
  const idx = toMonthIndex(year, month);
  return (
    idx >= toMonthIndex(normalized.startYear, normalized.startMonth) &&
    idx <= toMonthIndex(normalized.endYear, normalized.endMonth)
  );
}

/** Lista ordenada de {year, month} do início ao fim do intervalo, inclusive, atravessando anos. */
export function enumeratePeriodMonths(range: PeriodRange): Array<{ year: number; month: number }> {
  const normalized = normalizePeriodRange(range);
  const startIdx = toMonthIndex(normalized.startYear, normalized.startMonth);
  const endIdx = toMonthIndex(normalized.endYear, normalized.endMonth);
  const months: Array<{ year: number; month: number }> = [];
  for (let idx = startIdx; idx <= endIdx; idx++) {
    months.push(fromMonthIndex(idx));
  }
  return months;
}

/**
 * Ciclo semestral ativo na data de referência: junho–novembro ou
 * dezembro–maio (escolhendo o ano certo de cada lado). Usado apenas como
 * atalho de conveniência ("Ciclo atual") e como padrão do Painel Geral —
 * nunca como valor inicial dos filtros dos painéis administrativos, que
 * começam sempre sem restrição.
 */
export function getCurrentCycle(reference: Date = new Date()): PeriodRange {
  const year = reference.getFullYear();
  const month = reference.getMonth() + 1;

  if (month >= 6 && month <= 11) {
    return { startYear: year, startMonth: 6, endYear: year, endMonth: 11 };
  }
  if (month === 12) {
    return { startYear: year, startMonth: 12, endYear: year + 1, endMonth: 5 };
  }
  // Janeiro-maio pertencem ao ciclo iniciado em dezembro do ano anterior.
  return { startYear: year - 1, startMonth: 12, endYear: year, endMonth: 5 };
}

/** S1 (dezembro–maio, atravessa o ano civil) ou S2 (junho–novembro). */
export type Semester = "S1" | "S2";

/**
 * Converte Ano + Semestre no intervalo de meses correspondente. Para S1, o
 * ano informado é sempre o ano de INÍCIO (dezembro) — nunca o de término
 * (maio do ano seguinte). Ex.: `cycleFromYearSemester(2027, "S1")` =
 * Dez/2027 – Mai/2028, não Dez/2026 – Mai/2027.
 */
export function cycleFromYearSemester(year: number, semester: Semester): PeriodRange {
  return semester === "S2"
    ? { startYear: year, startMonth: 6, endYear: year, endMonth: 11 }
    : { startYear: year, startMonth: 12, endYear: year + 1, endMonth: 5 };
}

/** Inverso de `cycleFromYearSemester` — extrai Ano + Semestre de um ciclo. */
export function yearSemesterFromCycle(cycle: PeriodRange): {
  year: number;
  semester: Semester;
} {
  return cycle.startMonth === 12
    ? { year: cycle.startYear, semester: "S1" }
    : { year: cycle.startYear, semester: "S2" };
}

/**
 * Converte uma competência mensal no ciclo operacional que a contém.
 * Junho–novembro formam S2; dezembro–maio formam o S1 iniciado em dezembro.
 */
export function cycleForMonth(year: number, month: number): PeriodRange {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Competência mensal inválida.");
  }

  if (month >= 6 && month <= 11) {
    return { startYear: year, startMonth: 6, endYear: year, endMonth: 11 };
  }

  const startYear = month === 12 ? year : year - 1;
  return { startYear, startMonth: 12, endYear: startYear + 1, endMonth: 5 };
}

/**
 * Lista somente os ciclos representados por ao menos uma competência real,
 * sem duplicidade e do mais recente para o mais antigo.
 */
export function availableCyclesFromMonths(months: readonly MonthReference[]): PeriodRange[] {
  const cycles = new Map<string, PeriodRange>();

  for (const item of months) {
    if (
      !Number.isInteger(item.year) ||
      !Number.isInteger(item.month) ||
      item.month < 1 ||
      item.month > 12
    ) {
      continue;
    }

    const cycle = cycleForMonth(item.year, item.month);
    cycles.set(`${cycle.startYear}:${cycle.startMonth}`, cycle);
  }

  return Array.from(cycles.values()).sort(
    (left, right) =>
      toMonthIndex(right.startYear, right.startMonth) -
      toMonthIndex(left.startYear, left.startMonth),
  );
}

/** Ex.: "Dez/2026 – Mai/2027". Retorna "Tudo" quando `range` é `null`. */
export function formatPeriodRangeLabel(
  range: PeriodRange | null | undefined,
  monthNames: readonly string[] = MONTH_NAMES,
): string {
  if (!range) return "Tudo";
  const normalized = normalizePeriodRange(range);
  const start = `${monthNames[normalized.startMonth - 1] ?? normalized.startMonth}/${normalized.startYear}`;
  const end = `${monthNames[normalized.endMonth - 1] ?? normalized.endMonth}/${normalized.endYear}`;
  return `${start} – ${end}`;
}

const PERIOD_YEAR_MIN = 2000;
const PERIOD_YEAR_MAX = 2200;

function parseBoundedInt(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

/**
 * Lê os 4 campos de um intervalo a partir de uma query string. Tudo-ou-nada:
 * só retorna um `PeriodRange` normalizado se os 4 vierem presentes e
 * válidos; caso contrário retorna `null` (sem restrição), nunca um
 * intervalo parcialmente especificado.
 */
export function parsePeriodRangeParams(
  searchParams: URLSearchParams,
  prefix = "period",
): PeriodRange | null {
  const startYear = parseBoundedInt(
    searchParams.get(`${prefix}StartYear`),
    PERIOD_YEAR_MIN,
    PERIOD_YEAR_MAX,
  );
  const startMonth = parseBoundedInt(searchParams.get(`${prefix}StartMonth`), 1, 12);
  const endYear = parseBoundedInt(
    searchParams.get(`${prefix}EndYear`),
    PERIOD_YEAR_MIN,
    PERIOD_YEAR_MAX,
  );
  const endMonth = parseBoundedInt(searchParams.get(`${prefix}EndMonth`), 1, 12);

  if (startYear === null || startMonth === null || endYear === null || endMonth === null) {
    return null;
  }

  return normalizePeriodRange({ startYear, startMonth, endYear, endMonth });
}

/**
 * Mesma leitura tudo-ou-nada de `parsePeriodRangeParams`, mas a partir de 4
 * campos numéricos opcionais já validados por zod (uso típico: corpo de uma
 * rota de publicação, onde o período vem no JSON, não na query string).
 */
export function periodFromOptionalFields(fields: {
  periodStartYear?: number;
  periodStartMonth?: number;
  periodEndYear?: number;
  periodEndMonth?: number;
}): PeriodRange | null {
  const { periodStartYear, periodStartMonth, periodEndYear, periodEndMonth } = fields;
  if (
    periodStartYear === undefined ||
    periodStartMonth === undefined ||
    periodEndYear === undefined ||
    periodEndMonth === undefined
  ) {
    return null;
  }
  return normalizePeriodRange({
    startYear: periodStartYear,
    startMonth: periodStartMonth,
    endYear: periodEndYear,
    endMonth: periodEndMonth,
  });
}

/**
 * Fragmento de filtro Prisma equivalente a `isWithinPeriodRange`, para uso em
 * `deleteMany`/`findMany`/`count` sobre modelos com colunas `year`/`month`
 * (inclusive nos dois extremos, atravessando a virada do ano civil quando
 * necessário). O retorno não é tipado para um model Prisma específico — faça
 * cast para o `WhereInput` do model em uso no call site.
 *
 * `fields` sobrescreve os nomes das colunas para models cujas colunas não se
 * chamam `year`/`month` (ex.: `IdpRsoRecord.referenceYear`/`referenceMonth`).
 */
export function periodRangeWhere(
  range: PeriodRange,
  fields: { year?: string; month?: string } = {},
) {
  const yearField = fields.year ?? "year";
  const monthField = fields.month ?? "month";
  const normalized = normalizePeriodRange(range);
  return {
    AND: [
      {
        OR: [
          { [yearField]: { gt: normalized.startYear } },
          {
            AND: [
              { [yearField]: normalized.startYear },
              { [monthField]: { gte: normalized.startMonth } },
            ],
          },
        ],
      },
      {
        OR: [
          { [yearField]: { lt: normalized.endYear } },
          {
            AND: [
              { [yearField]: normalized.endYear },
              { [monthField]: { lte: normalized.endMonth } },
            ],
          },
        ],
      },
    ],
  };
}

/** Inverso de `periodFromOptionalFields` — para montar query string ou corpo de requisição. */
export function periodToOptionalFields(range: PeriodRange | null): {
  periodStartYear?: number;
  periodStartMonth?: number;
  periodEndYear?: number;
  periodEndMonth?: number;
} {
  if (!range) return {};
  return {
    periodStartYear: range.startYear,
    periodStartMonth: range.startMonth,
    periodEndYear: range.endYear,
    periodEndMonth: range.endMonth,
  };
}

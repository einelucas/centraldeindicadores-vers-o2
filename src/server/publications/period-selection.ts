import type { IdpPublishedPayload } from "@/features/idp/publications";
import type { PeriodRange } from "@/lib/period";
import { normalizePeriodRange } from "@/lib/period";

export type PublishedModule = "rdo" | "idp" | "rnc" | "cinco-s" | "taxa-acidentes";

type PublicationLike = {
  active: boolean;
  payload: unknown;
};

function isPeriodRange(value: unknown): value is PeriodRange {
  if (!value || typeof value !== "object") return false;
  const period = value as Partial<PeriodRange>;
  return [period.startYear, period.startMonth, period.endYear, period.endMonth].every(
    (item) => typeof item === "number" && Number.isInteger(item),
  );
}

/** Resolve o intervalo gravado no snapshot, incluindo o formato legado do IDP. */
export function publicationPeriod(module: PublishedModule, payload: unknown): PeriodRange | null {
  if (!payload || typeof payload !== "object") return null;

  const period = (payload as { periodo?: unknown }).periodo;
  if (isPeriodRange(period)) return normalizePeriodRange(period);

  if (module !== "idp") return null;
  const idp = payload as Partial<IdpPublishedPayload>;
  const startYear = idp.historyStartYear ?? idp.selectedYear;
  const endYear = idp.historyEndYear ?? idp.selectedYear;
  if (
    typeof startYear !== "number" ||
    typeof endYear !== "number" ||
    typeof idp.historyMonthStart !== "number" ||
    typeof idp.historyMonthEnd !== "number"
  ) {
    return null;
  }

  return normalizePeriodRange({
    startYear,
    startMonth: idp.historyMonthStart,
    endYear,
    endMonth: idp.historyMonthEnd,
  });
}

export function periodsMatch(a: PeriodRange, b: PeriodRange): boolean {
  const left = normalizePeriodRange(a);
  const right = normalizePeriodRange(b);
  return (
    left.startYear === right.startYear &&
    left.startMonth === right.startMonth &&
    left.endYear === right.endYear &&
    left.endMonth === right.endMonth
  );
}

/** Publicação com as colunas de ciclo (podem ser nulas em linhas antigas). */
export type PublicationWithCycle = PublicationLike & {
  cycleYear: number | null;
  cycleSemester: string | null;
  periodStartYear: number | null;
  periodStartMonth: number | null;
  periodEndYear: number | null;
  periodEndMonth: number | null;
};

/**
 * Resolve o período de uma publicação priorizando as colunas dedicadas
 * (`periodStartYear`/`periodStartMonth`/`periodEndYear`/`periodEndMonth`) e
 * caindo para o parser de `payload` (`publicationPeriod`) só em linhas
 * gravadas antes da coluna existir — nunca as duas fontes ao mesmo tempo.
 */
export function publicationCyclePeriod(
  module: PublishedModule,
  publication: PublicationWithCycle,
): PeriodRange | null {
  const { periodStartYear, periodStartMonth, periodEndYear, periodEndMonth } = publication;
  if (
    periodStartYear !== null &&
    periodStartMonth !== null &&
    periodEndYear !== null &&
    periodEndMonth !== null
  ) {
    return normalizePeriodRange({
      startYear: periodStartYear,
      startMonth: periodStartMonth,
      endYear: periodEndYear,
      endMonth: periodEndMonth,
    });
  }
  return publicationPeriod(module, publication.payload);
}

export function selectPublicationForPeriod<T extends PublicationWithCycle>(
  module: PublishedModule,
  publications: T[],
  requestedPeriod: PeriodRange | null,
): { publication: T | null; historyCount: number } {
  const historyCount = publications.filter(
    (publication) => publicationCyclePeriod(module, publication) !== null,
  ).length;

  const publication = requestedPeriod
    ? (publications.find((item) => {
        const period = publicationCyclePeriod(module, item);
        return period ? periodsMatch(period, requestedPeriod) : false;
      }) ?? null)
    : (publications.find((item) => item.active) ?? null);

  return { publication, historyCount };
}

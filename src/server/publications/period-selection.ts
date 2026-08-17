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

export function selectPublicationForPeriod<T extends PublicationLike>(
  module: PublishedModule,
  publications: T[],
  requestedPeriod: PeriodRange | null,
): { publication: T | null; historyCount: number } {
  const historyCount = publications.filter(
    (publication) => publicationPeriod(module, publication.payload) !== null,
  ).length;

  const publication = requestedPeriod
    ? (publications.find((item) => {
        const period = publicationPeriod(module, item.payload);
        return period ? periodsMatch(period, requestedPeriod) : false;
      }) ?? null)
    : (publications.find((item) => item.active) ?? null);

  return { publication, historyCount };
}

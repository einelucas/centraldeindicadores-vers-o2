import type { RdoPublishedPayload } from "@/features/rdo/publications";
import type { IdpPublishedPayload } from "@/features/idp/publications";
import type { RncPublishedPayload } from "@/features/rnc/publications";
import type { FiveSPublishedPayload } from "@/features/cinco-s/publications";
import type { AccidentRatePublishedPayload } from "@/features/taxa-acidentes/publications";
import {
  SC_INDICATORS,
  SCORECARD_MONTHLY_POOL as MONTHLY_POOL,
  type ScorecardIndicator,
} from "@/features/scorecard/types";
import { MONTH_NAMES, MONTH_NAMES_FULL } from "@/lib/dates";

/** 11.582 pontos do ciclo divididos igualmente pelos seis meses. */
export const SCORECARD_MONTHLY_POOL = MONTHLY_POOL;

export interface GeneralPanelPublicationInput {
  id: string;
  module: string;
  indicator: string;
  version: number;
  target: number | null;
  result: number | null;
  status: string | null;
  payload: unknown;
  publishedAt: Date;
  publishedBy: { id: string; name: string; email: string };
}

export interface GeneralPanelMonthCell {
  key: string;
  label: string;
  value: number | null;
  pass: boolean | null;
  pctOfMeta: number | null;
}

export interface GeneralPanelIndicator {
  key: string;
  label: string;
  shortLabel: string;
  peso: number;
  meta: number;
  direction: "higher" | "lower";
  unit: string;
  result: number | null;
  hasData: boolean;
  pass: boolean | null;
  partial: number | null;
  partialPass: boolean | null;
  months: GeneralPanelMonthCell[];
  publication: null | {
    id: string;
    version: number;
    publishedAt: string;
    publishedBy: { id: string; name: string; email: string };
  };
}

export interface GeneralPanelData {
  hasData: boolean;
  monthKeys: string[];
  monthLabels: string[];
  pontuacaoPrevista: number;
  pontosRealizados: number;
  atendimentoGeral: number;
  referenceDate: string | null;
  indicators: GeneralPanelIndicator[];
}

const SHORT_LABELS: Record<string, string> = {
  rdo: "RDO",
  cronograma: "Cronograma",
  rnc: "RNC",
  "5s": "5S",
  taxa_acidentes: "Acidentes",
};

interface AdaptedPublication {
  current: number | null;
  monthly: Record<string, number>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Converte "Jan/2026" ou "Junho/2026" em "2026-01" ou "2026-06". */
export function monthLabelToKey(label: string): string | null {
  const [monthText, yearText] = String(label ?? "").trim().split("/");
  const year = Number(yearText);
  const normalizedMonth = String(monthText ?? "").trim().toLowerCase();
  let month = MONTH_NAMES.findIndex(
    (name) => name.toLowerCase() === normalizedMonth,
  );
  if (month < 0) {
    month = MONTH_NAMES_FULL.findIndex(
      (name) => name.toLowerCase() === normalizedMonth,
    );
  }
  if (month < 0 || !Number.isInteger(year) || year < 1900) return null;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function monthKeyToLabel(key: string): string {
  const [year, monthText] = key.split("-");
  const month = Number(monthText);
  return `${MONTH_NAMES[month - 1] ?? "?"}/${year}`;
}

function readRdoPayload(payload: unknown): RdoPublishedPayload | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.resultado !== "number" || !Array.isArray(payload.mensal)) {
    return null;
  }
  return payload as unknown as RdoPublishedPayload;
}

function readIdpPayload(payload: unknown): IdpPublishedPayload | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.resultado !== "number" || !Array.isArray(payload.mensal)) {
    return null;
  }
  return payload as unknown as IdpPublishedPayload;
}

function readRncPayload(payload: unknown): RncPublishedPayload | null {
  if (!isRecord(payload)) return null;
  if (
    typeof payload.resultado !== "number" ||
    typeof payload.meta !== "number" ||
    !Array.isArray(payload.mensal)
  ) {
    return null;
  }
  return payload as unknown as RncPublishedPayload;
}

function readFiveSPayload(payload: unknown): FiveSPublishedPayload | null {
  if (!isRecord(payload)) return null;
  if (
    typeof payload.resultado !== "number" ||
    typeof payload.meta !== "number" ||
    !Array.isArray(payload.mensal)
  ) {
    return null;
  }
  return payload as unknown as FiveSPublishedPayload;
}

function readAccidentRatePayload(
  payload: unknown,
): AccidentRatePublishedPayload | null {
  if (!isRecord(payload)) return null;
  if (
    typeof payload.resultado !== "number" ||
    typeof payload.meta !== "number" ||
    !Array.isArray(payload.mensal)
  ) {
    return null;
  }
  return payload as unknown as AccidentRatePublishedPayload;
}

function monthlyFromValueRows(
  rows: readonly { label: string; v: number | null }[],
): Record<string, number> {
  const monthly: Record<string, number> = {};
  for (const month of rows) {
    const monthKey = monthLabelToKey(month.label);
    if (monthKey && month.v !== null && Number.isFinite(month.v)) {
      monthly[monthKey] = month.v;
    }
  }
  return monthly;
}

function adaptPublication(
  key: string,
  publication: GeneralPanelPublicationInput,
): AdaptedPublication {
  if (key === "rdo") {
    const payload = readRdoPayload(publication.payload);
    return payload
      ? { current: payload.resultado, monthly: monthlyFromValueRows(payload.mensal) }
      : { current: null, monthly: {} };
  }

  if (key === "cronograma") {
    const payload = readIdpPayload(publication.payload);
    return payload
      ? { current: payload.resultado, monthly: monthlyFromValueRows(payload.mensal) }
      : { current: null, monthly: {} };
  }

  if (key === "rnc") {
    const payload = readRncPayload(publication.payload);
    return payload
      ? { current: payload.resultado, monthly: monthlyFromValueRows(payload.mensal) }
      : { current: null, monthly: {} };
  }

  if (key === "5s") {
    const payload = readFiveSPayload(publication.payload);
    return payload
      ? { current: payload.resultado, monthly: monthlyFromValueRows(payload.mensal) }
      : { current: null, monthly: {} };
  }

  if (key === "taxa_acidentes") {
    const payload = readAccidentRatePayload(publication.payload);
    if (!payload) return { current: null, monthly: {} };
    const monthly: Record<string, number> = {};
    for (const month of payload.mensal) {
      const monthKey = monthLabelToKey(month.label);
      if (monthKey && Number.isFinite(month.taxa)) monthly[monthKey] = month.taxa;
    }
    return { current: payload.resultado, monthly };
  }

  return { current: null, monthly: {} };
}

/** Valor mensal publicado de um indicador para o período solicitado. */
export function publishedValueForPeriod(
  key: string,
  publication: GeneralPanelPublicationInput,
  year: number,
  month: number,
): number | null {
  const adapted = adaptPublication(key, publication);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  return adapted.monthly[monthKey] ?? null;
}

function publicationForIndicator(
  indicator: ScorecardIndicator,
  publications: readonly GeneralPanelPublicationInput[],
): GeneralPanelPublicationInput | null {
  if (!indicator.source) return null;
  return (
    publications
      .filter(
        (publication) =>
          publication.module === indicator.source?.module &&
          publication.indicator === indicator.source?.indicator,
      )
      .sort(
        (a, b) =>
          b.publishedAt.getTime() - a.publishedAt.getTime() ||
          b.version - a.version,
      )[0] ?? null
  );
}

export function passesPanelTarget(
  indicator: ScorecardIndicator,
  value: number | null | undefined,
): boolean | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return indicator.direction === "lower"
    ? value <= indicator.meta
    : value >= indicator.meta;
}

export function percentOfTarget(
  indicator: ScorecardIndicator,
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  if (indicator.direction === "lower") {
    return value > 0 ? (indicator.meta / value) * 100 : 100;
  }
  return indicator.meta ? (value / indicator.meta) * 100 : null;
}

/** Consolida exclusivamente snapshots efetivamente publicados. */
export function buildGeneralPanelData(
  publications: readonly GeneralPanelPublicationInput[],
  indicators: readonly ScorecardIndicator[] = SC_INDICATORS,
): GeneralPanelData {
  const adaptedByKey = new Map<
    string,
    { publication: GeneralPanelPublicationInput; data: AdaptedPublication }
  >();
  const monthKeySet = new Set<string>();

  for (const indicator of indicators) {
    const publication = publicationForIndicator(indicator, publications);
    if (!publication) continue;
    const data = adaptPublication(indicator.key, publication);
    adaptedByKey.set(indicator.key, { publication, data });
    Object.keys(data.monthly).forEach((key) => monthKeySet.add(key));
  }

  const monthKeys = Array.from(monthKeySet).sort();
  const monthLabels = monthKeys.map(monthKeyToLabel);

  let pontosRealizadosRaw = 0;
  for (const monthKey of monthKeys) {
    for (const indicator of indicators) {
      const value = adaptedByKey.get(indicator.key)?.data.monthly[monthKey];
      if (value === undefined) continue;
      if (passesPanelTarget(indicator, value)) {
        pontosRealizadosRaw += (indicator.peso / 100) * SCORECARD_MONTHLY_POOL;
      }
    }
  }

  const pontuacaoPrevista = monthKeys.length * SCORECARD_MONTHLY_POOL;
  const pontosRealizados = Math.round(pontosRealizadosRaw);
  const atendimentoGeral = pontuacaoPrevista
    ? (pontosRealizados / pontuacaoPrevista) * 100
    : 0;

  const resultIndicators: GeneralPanelIndicator[] = indicators.map((indicator) => {
    const adapted = adaptedByKey.get(indicator.key);
    const publication = adapted?.publication ?? null;
    const current = adapted?.data.current ?? null;
    const monthlyValues = monthKeys
      .map((key) => adapted?.data.monthly[key])
      .filter((value): value is number => value !== undefined);
    const partial = monthlyValues.length
      ? monthlyValues.reduce((sum, value) => sum + value, 0) /
        monthlyValues.length
      : current;

    return {
      key: indicator.key,
      label: indicator.label,
      shortLabel: SHORT_LABELS[indicator.key] ?? indicator.label,
      peso: indicator.peso,
      meta: indicator.meta,
      direction: indicator.direction,
      unit: indicator.unit,
      result: current,
      hasData: current !== null || monthlyValues.length > 0,
      pass: passesPanelTarget(indicator, current),
      partial,
      partialPass: passesPanelTarget(indicator, partial),
      months: monthKeys.map((key) => {
        const value = adapted?.data.monthly[key] ?? null;
        return {
          key,
          label: monthKeyToLabel(key),
          value,
          pass: passesPanelTarget(indicator, value),
          pctOfMeta: percentOfTarget(indicator, value),
        };
      }),
      publication: publication
        ? {
            id: publication.id,
            version: publication.version,
            publishedAt: publication.publishedAt.toISOString(),
            publishedBy: publication.publishedBy,
          }
        : null,
    };
  });

  const latestPublication = publications
    .slice()
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())[0];

  return {
    hasData: resultIndicators.some((indicator) => indicator.hasData),
    monthKeys,
    monthLabels,
    pontuacaoPrevista,
    pontosRealizados,
    atendimentoGeral,
    referenceDate: latestPublication?.publishedAt.toISOString() ?? null,
    indicators: resultIndicators,
  };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { INDICATOR_DATA_CHANGED_EVENT } from "@/lib/browser-events";
import {
  formatPeriodOptionLabel,
  getOperationalPeriod,
  nextPeriod,
  toMonthIndex,
  yearSemesterFromCycle,
  type PeriodRange,
  type Semester,
} from "@/lib/period";

export interface PeriodOption {
  year: number;
  semester: Semester;
}

export function periodOptionKey(year: number, semester: Semester): string {
  return `${year}:${semester}`;
}

/** "Jun, Jul e Ago" — usado na linha de cobertura mensal do card de contexto. */
export function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

type AvailablePeriodSource = "rdo" | "idp" | "rnc" | "cinco-s" | "taxa-acidentes" | "scorecard";

/**
 * Estado e lógica do seletor único de "período de trabalho" usado no card de
 * Contexto de publicação de cada módulo admin: ciclos com dado real (mesmo
 * endpoint do painel publicado), "Preparar próximo semestre" e detecção de
 * "novo período" depois de uma importação. Não decide layout — cada view usa
 * os valores retornados na própria composição visual.
 */
export function usePublicationPeriodOptions(
  source: AvailablePeriodSource,
  year: number,
  semester: Semester,
) {
  const [availablePeriods, setAvailablePeriods] = useState<PeriodOption[]>([]);

  const loadAvailablePeriods = useCallback(async () => {
    try {
      const response = await fetch(`/api/available-periods?source=${source}`, {
        cache: "no-store",
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { periods?: PeriodRange[] };
      const next = (body.periods ?? []).map(yearSemesterFromCycle);
      setAvailablePeriods(next);
      return next;
    } catch {
      return null;
    }
  }, [source]);

  useEffect(() => {
    void loadAvailablePeriods();
    window.addEventListener(INDICATOR_DATA_CHANGED_EVENT, loadAvailablePeriods);
    return () => window.removeEventListener(INDICATOR_DATA_CHANGED_EVENT, loadAvailablePeriods);
  }, [loadAvailablePeriods]);

  const currentPeriodHasData = availablePeriods.some(
    (item) => item.year === year && item.semester === semester,
  );

  // Ordem cronológica decrescente pela data real de início do ciclo — S1 do
  // "ano do período" começa em dezembro do ano ANTERIOR, então não dá pra
  // comparar direto pelo `year` do rótulo (ver cycleFromYearSemester).
  const periodOptions = (
    currentPeriodHasData ? availablePeriods : [...availablePeriods, { year, semester }]
  )
    .slice()
    .sort((a, b) => {
      const startA = a.semester === "S2" ? toMonthIndex(a.year, 6) : toMonthIndex(a.year - 1, 12);
      const startB = b.semester === "S2" ? toMonthIndex(b.year, 6) : toMonthIndex(b.year - 1, 12);
      return startB - startA;
    });

  /**
   * Chama depois de uma gravação bem-sucedida (importação ou lançamento
   * manual). Se todos os registros pertencem a um único período que não
   * tinha dado nenhum antes desta gravação (não é uma correção de período
   * histórico), aplica `setPeriod` para lá e retorna a mensagem de aviso.
   * Caso contrário não altera nada e retorna `null`.
   */
  function detectNewPeriod(
    records: ReadonlyArray<{ year: number; month: number }>,
    setPeriod: (year: number, semester: Semester) => void,
  ): string | null {
    const periodsBeforeImport = availablePeriods;
    const keys = new Set(
      records.map((record) => {
        const period = getOperationalPeriod(record.year, record.month);
        return periodOptionKey(period.periodYear, period.semester);
      }),
    );
    if (keys.size !== 1) return null;
    const [key] = keys;
    const [yearText, semesterText] = (key ?? "").split(":");
    const periodYear = Number(yearText);
    const periodSemester = semesterText as Semester;
    const isNewPeriod = !periodsBeforeImport.some(
      (item) => periodOptionKey(item.year, item.semester) === key,
    );
    if (!isNewPeriod) return null;
    setPeriod(periodYear, periodSemester);
    return `Novo período detectado: ${formatPeriodOptionLabel(periodYear, periodSemester)}.`;
  }

  return {
    availablePeriods,
    periodOptions,
    currentPeriodHasData,
    loadAvailablePeriods,
    detectNewPeriod,
  };
}

/** Próximo semestre cronológico — usado por "Preparar próximo semestre". */
export function nextWorkingPeriod(year: number, semester: Semester): PeriodOption {
  return nextPeriod(year, semester);
}

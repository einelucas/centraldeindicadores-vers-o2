"use client";

import { useMemo, useState } from "react";
import type { ReadingSemester } from "./ReadingContextCard";
import {
  cycleFromYearSemester,
  getCurrentCycle,
  periodToOptionalFields,
  yearSemesterFromCycle,
  type PeriodRange,
} from "@/lib/period";

export { cycleFromYearSemester, yearSemesterFromCycle };

export function periodQueryString(period: PeriodRange): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(periodToOptionalFields(period))) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}

/**
 * @param initialPeriod Período salvo a usar como valor inicial em vez do
 * ciclo vigente na data real — usado apenas pelo Scorecard, cujo período de
 * Administração é persistido no servidor e compartilhado com o Painel Geral.
 * Os demais módulos não passam esse argumento e sempre partem do ciclo atual.
 */
export function useReadingContextCycle(initialPeriod?: PeriodRange | null) {
  const [current] = useState(() => yearSemesterFromCycle(getCurrentCycle()));
  const [initial] = useState(() =>
    initialPeriod ? yearSemesterFromCycle(initialPeriod) : current,
  );
  const [year, setYear] = useState(initial.year);
  const [semester, setSemester] = useState<ReadingSemester>(initial.semester);
  const cycle = useMemo(() => cycleFromYearSemester(year, semester), [semester, year]);

  return {
    year,
    semester,
    cycle,
    isCurrent: year === current.year && semester === current.semester,
    setPeriod(nextYear: number, nextSemester: ReadingSemester) {
      setYear(nextYear);
      setSemester(nextSemester);
    },
  };
}

"use client";

import { useMemo, useState } from "react";
import type { ReadingSemester } from "./ReadingContextCard";
import { getCurrentCycle, periodToOptionalFields, type PeriodRange } from "@/lib/period";

export function cycleFromYearSemester(year: number, semester: ReadingSemester): PeriodRange {
  return semester === "S2"
    ? { startYear: year, startMonth: 6, endYear: year, endMonth: 11 }
    : { startYear: year, startMonth: 12, endYear: year + 1, endMonth: 5 };
}

export function yearSemesterFromCycle(cycle: PeriodRange): {
  year: number;
  semester: ReadingSemester;
} {
  return cycle.startMonth === 12
    ? { year: cycle.startYear, semester: "S1" }
    : { year: cycle.startYear, semester: "S2" };
}

export function periodQueryString(period: PeriodRange): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(periodToOptionalFields(period))) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}

export function useReadingContextCycle() {
  const [current] = useState(() => yearSemesterFromCycle(getCurrentCycle()));
  const [year, setYear] = useState(current.year);
  const [semester, setSemester] = useState<ReadingSemester>(current.semester);
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

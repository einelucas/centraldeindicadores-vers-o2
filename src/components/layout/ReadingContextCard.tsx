"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { INDICATOR_DATA_CHANGED_EVENT } from "@/lib/browser-events";
import { formatPeriodOptionLabel, yearSemesterFromCycle, type PeriodRange, type Semester } from "@/lib/period";

export type { Semester as ReadingSemester } from "@/lib/period";

interface AvailablePeriod {
  year: number;
  semester: Semester;
}

const PERIOD_SOURCE_BY_HREF: Record<string, string> = {
  "/dashboard/scorecard": "scorecard",
  "/dashboard/rdo": "rdo",
  "/dashboard/idp": "idp",
  "/dashboard/rnc": "rnc",
  "/dashboard/cinco-s": "cinco-s",
  "/dashboard/taxa-acidentes": "taxa-acidentes",
};

/**
 * Contexto compartilhado pelos painéis publicados — hoje reduzido a só o
 * seletor de Ano + Semestre. `activeHref` continua sendo usado apenas para
 * escolher a fonte de `/api/available-periods` (nunca navega mais entre
 * módulos: isso já é feito pelos ícones do TabsNav). `historyCount` continua
 * fazendo parte do contrato do componente — outras telas ainda o calculam e
 * passam — mas não é mais exibido aqui.
 */
export function ReadingContextCard({
  activeHref,
  year,
  semester,
  onPeriodChange,
  isCurrent,
}: {
  activeHref: string;
  historyCount: number;
  year: number;
  semester: Semester;
  onPeriodChange: (year: number, semester: Semester) => void;
  isCurrent: boolean;
}) {
  const selectedPeriod = `${year}:${semester}`;

  const [availablePeriods, setAvailablePeriods] = useState<AvailablePeriod[] | null>(null);
  const [periodsError, setPeriodsError] = useState(false);
  const onPeriodChangeRef = useRef(onPeriodChange);
  onPeriodChangeRef.current = onPeriodChange;

  const selectedPeriodAvailable =
    availablePeriods?.some((item) => item.year === year && item.semester === semester) ?? false;
  const years = Array.from(new Set((availablePeriods ?? []).map((item) => item.year))).sort(
    (left, right) => right - left,
  );

  useEffect(() => {
    const source = PERIOD_SOURCE_BY_HREF[activeHref];
    if (!source) {
      setAvailablePeriods([]);
      return;
    }

    let disposed = false;
    let requestId = 0;
    setAvailablePeriods(null);
    setPeriodsError(false);

    const loadAvailablePeriods = async () => {
      const currentRequest = ++requestId;
      try {
        const response = await fetch(
          `/api/available-periods?source=${encodeURIComponent(source)}`,
          {
            cache: "no-store",
          },
        );
        if (!response.ok) throw new Error("Falha ao carregar períodos disponíveis.");
        const body = (await response.json()) as { periods?: PeriodRange[] };
        const periods = (body.periods ?? []).map(yearSemesterFromCycle);
        if (disposed || currentRequest !== requestId) return;
        setAvailablePeriods(periods);
        setPeriodsError(false);
      } catch {
        if (disposed || currentRequest !== requestId) return;
        setAvailablePeriods([]);
        setPeriodsError(true);
      }
    };

    void loadAvailablePeriods();
    window.addEventListener(INDICATOR_DATA_CHANGED_EVENT, loadAvailablePeriods);

    return () => {
      disposed = true;
      window.removeEventListener(INDICATOR_DATA_CHANGED_EVENT, loadAvailablePeriods);
    };
  }, [activeHref]);

  useEffect(() => {
    if (!availablePeriods?.length || selectedPeriodAvailable) return;
    const latest = availablePeriods[0]!;
    onPeriodChangeRef.current(latest.year, latest.semester);
  }, [availablePeriods, selectedPeriodAvailable]);

  return (
    <section className="reading-context-card" aria-label="Contexto de leitura">
      <label className="reading-context-compact-field">
        <span className="reading-context-compact-legend">Período</span>
        <span className="reading-context-compact-select-box">
          <select
            aria-label="Período"
            value={selectedPeriodAvailable ? selectedPeriod : ""}
            onChange={(event) => {
              const [nextYear, nextSemester] = event.target.value.split(":");
              onPeriodChange(Number(nextYear), nextSemester as Semester);
            }}
            className="reading-context-compact-select"
            disabled={!availablePeriods?.length}
          >
            {!availablePeriods?.length ? (
              <option value="">
                {availablePeriods === null
                  ? "Carregando períodos…"
                  : periodsError
                    ? "Não foi possível carregar"
                    : "Nenhum período com dados"}
              </option>
            ) : null}
            {years.map((optionYear) => {
              const yearPeriods = (availablePeriods ?? []).filter(
                (item) => item.year === optionYear,
              );
              return (
                <optgroup key={optionYear} label={String(optionYear)}>
                  {(["S2", "S1"] as const).map((optionSemester) => {
                    if (!yearPeriods.some((item) => item.semester === optionSemester)) return null;
                    const currentOption =
                      isCurrent && optionYear === year && semester === optionSemester;
                    return (
                      <option key={optionSemester} value={`${optionYear}:${optionSemester}`}>
                        {currentOption
                          ? `Período atual · ${formatPeriodOptionLabel(optionYear, optionSemester)}`
                          : formatPeriodOptionLabel(optionYear, optionSemester)}
                      </option>
                    );
                  })}
                </optgroup>
              );
            })}
          </select>
          <ChevronDown aria-hidden className="reading-context-chevron" />
        </span>
      </label>
    </section>
  );
}

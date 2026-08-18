"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { INDICATOR_DATA_CHANGED_EVENT } from "@/lib/browser-events";
import type { PeriodRange, Semester } from "@/lib/period";
import { TABS } from "./TabsNav";

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

function toAvailablePeriod(period: PeriodRange): AvailablePeriod | null {
  if (period.startMonth === 6) return { year: period.startYear, semester: "S2" };
  if (period.startMonth === 12) return { year: period.startYear, semester: "S1" };
  return null;
}

/**
 * Contexto compartilhado pelos painéis publicados. O primeiro campo navega
 * entre módulos; o segundo escolhe ano + semestre como um único contexto.
 */
export function ReadingContextCard({
  activeHref,
  historyCount,
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
  const router = useRouter();
  const activeTab = TABS.find((tab) => tab.href === activeHref) ?? TABS[0]!;
  const selectedPeriod = `${year}:${semester}`;

  const [guideOpen, setGuideOpen] = useState(false);
  const [availablePeriods, setAvailablePeriods] = useState<AvailablePeriod[] | null>(null);
  const [periodsError, setPeriodsError] = useState(false);
  const guideRef = useRef<HTMLFieldSetElement>(null);
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
        const periods = (body.periods ?? [])
          .map(toAvailablePeriod)
          .filter((item): item is AvailablePeriod => item !== null);
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

  useEffect(() => {
    if (!guideOpen) return;

    function onClickOutside(event: MouseEvent) {
      if (guideRef.current && !guideRef.current.contains(event.target as Node)) {
        setGuideOpen(false);
      }
    }

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [guideOpen]);

  return (
    <section className="reading-context-card" aria-labelledby="reading-context-title">
      <div className="reading-context-header">
        <div>
          <h2 id="reading-context-title" className="reading-context-title">
            Contexto da leitura
          </h2>
          <p className="reading-context-description">
            Selecione o contexto desejado para a leitura dos indicadores.
          </p>
        </div>

        <div className="reading-context-chips" aria-label="Resumo do contexto selecionado">
          <span className="reading-context-chip">
            {year} {semester}
          </span>
          <span className="reading-context-chip">{activeTab.contextLabel}</span>
          <span className="reading-context-chip">Histórico {historyCount}</span>
        </div>
      </div>

      <div className="reading-context-controls">
        <fieldset className="reading-context-field" ref={guideRef}>
          <legend>Guia ativa</legend>
          <button
            type="button"
            onClick={() => setGuideOpen((current) => !current)}
            aria-expanded={guideOpen}
            aria-haspopup="listbox"
            className="reading-context-trigger"
          >
            {activeTab.contextLabel}
            <ChevronDown aria-hidden className="reading-context-chevron" />
          </button>

          {guideOpen ? (
            <div role="listbox" className="reading-context-menu">
              {TABS.map((tab) => {
                const selected = tab.href === activeHref;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setGuideOpen(false);
                      if (!selected) router.push(tab.href);
                    }}
                    className={
                      selected
                        ? "reading-context-option reading-context-option-active"
                        : "reading-context-option"
                    }
                  >
                    {tab.contextLabel}
                  </button>
                );
              })}
            </div>
          ) : null}
        </fieldset>

        <fieldset className="reading-context-field">
          <legend>Período</legend>
          <select
            aria-label="Período"
            value={selectedPeriodAvailable ? selectedPeriod : ""}
            onChange={(event) => {
              const [nextYear, nextSemester] = event.target.value.split(":");
              onPeriodChange(Number(nextYear), nextSemester as Semester);
            }}
            className="reading-context-select"
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
                          ? `Período atual · ${optionYear} ${optionSemester}`
                          : optionSemester === "S2"
                            ? `${optionYear} S2 · Jun – Nov`
                            : `${optionYear} S1 · Dez – Mai`}
                      </option>
                    );
                  })}
                </optgroup>
              );
            })}
          </select>
        </fieldset>
      </div>
    </section>
  );
}

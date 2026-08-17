"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { TABS } from "./TabsNav";

export type ReadingSemester = "S1" | "S2";

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
  semester: ReadingSemester;
  onPeriodChange: (year: number, semester: ReadingSemester) => void;
  isCurrent: boolean;
}) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, index) => currentYear + 1 - index);
  const activeTab = TABS.find((tab) => tab.href === activeHref) ?? TABS[0]!;
  const selectedPeriod = `${year}:${semester}`;

  const [guideOpen, setGuideOpen] = useState(false);
  const guideRef = useRef<HTMLFieldSetElement>(null);

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
            value={selectedPeriod}
            onChange={(event) => {
              const [nextYear, nextSemester] = event.target.value.split(":");
              onPeriodChange(Number(nextYear), nextSemester as ReadingSemester);
            }}
            className="reading-context-select"
          >
            {years.map((optionYear) => (
              <optgroup key={optionYear} label={String(optionYear)}>
                <option value={`${optionYear}:S2`}>
                  {isCurrent && optionYear === year && semester === "S2"
                    ? `Período atual · ${optionYear} S2`
                    : `${optionYear} S2 · Jun – Nov`}
                </option>
                <option value={`${optionYear}:S1`}>
                  {isCurrent && optionYear === year && semester === "S1"
                    ? `Período atual · ${optionYear} S1`
                    : `${optionYear} S1 · Dez – Mai`}
                </option>
              </optgroup>
            ))}
          </select>
        </fieldset>
      </div>
    </section>
  );
}

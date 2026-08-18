"use client";

import type { ReactNode } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ViewFilterPopover } from "@/components/admin/ViewFilterPopover";
import { formatPeriodOptionLabel, type PeriodRange, type Semester } from "@/lib/period";
import { periodOptionKey, type PeriodOption } from "@/components/admin/usePublicationPeriodOptions";

/**
 * Seletor único de "período de trabalho" (substitui Ano inicial/Semestre/Ano
 * final) — mesma linguagem clara do painel publicado ("2027 S1 · Dez/26 -
 * Mai/27"), com "Preparar próximo semestre" e o filtro de visualização
 * ("Detalhar meses") lado a lado. `children` é a linha de cobertura/estado
 * abaixo, que cada módulo compõe à sua maneira.
 */
export function PublicationPeriodField({
  fieldId,
  year,
  semester,
  onChange,
  periodOptions,
  availablePeriods,
  publishPeriod,
  viewFilter,
  onViewFilterChange,
  yearsInData,
  onPrepareNextSemester,
  children,
}: {
  fieldId: string;
  year: number;
  semester: Semester;
  onChange: (year: number, semester: Semester) => void;
  periodOptions: PeriodOption[];
  availablePeriods: PeriodOption[];
  publishPeriod: PeriodRange;
  /** Omita os três (viewFilter/onViewFilterChange) quando o módulo não tiver
      um filtro de visualização independente do período de trabalho (ex.:
      Scorecard) — o botão "Detalhar meses" simplesmente não é renderizado. */
  viewFilter?: PeriodRange | null | undefined;
  onViewFilterChange?: (next: PeriodRange | null | undefined) => void;
  yearsInData?: readonly number[];
  onPrepareNextSemester: () => void;
  children?: ReactNode;
}) {
  const viewFilterOutsideWorkingPeriod =
    !!viewFilter &&
    (viewFilter.startYear !== publishPeriod.startYear ||
      viewFilter.startMonth !== publishPeriod.startMonth ||
      viewFilter.endYear !== publishPeriod.endYear ||
      viewFilter.endMonth !== publishPeriod.endMonth);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={fieldId}>Período de trabalho</Label>
      <Select
        id={fieldId}
        value={periodOptionKey(year, semester)}
        onChange={(event) => {
          const [nextYearText, nextSemesterText] = event.target.value.split(":");
          if (!nextYearText || !nextSemesterText) return;
          onChange(Number(nextYearText), nextSemesterText as Semester);
        }}
      >
        {periodOptions.map((option) => {
          const hasData = availablePeriods.some(
            (item) => item.year === option.year && item.semester === option.semester,
          );
          return (
            <option
              key={periodOptionKey(option.year, option.semester)}
              value={periodOptionKey(option.year, option.semester)}
            >
              {formatPeriodOptionLabel(option.year, option.semester)}
              {hasData ? "" : " · Sem dados"}
            </option>
          );
        })}
      </Select>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto px-1.5 py-1 text-xs text-muted-foreground"
          onClick={onPrepareNextSemester}
        >
          <CalendarPlus className="size-3.5" />
          Preparar próximo semestre
        </Button>
        {onViewFilterChange ? (
          <ViewFilterPopover
            value={viewFilter}
            onChange={onViewFilterChange}
            yearsInData={yearsInData}
            publishedLabel={formatPeriodOptionLabel(year, semester)}
            label="Detalhar meses"
          />
        ) : null}
      </div>
      {viewFilterOutsideWorkingPeriod ? (
        <p className="text-xs font-medium text-accent-foreground">
          “Detalhar meses” está fora do período de trabalho (
          {formatPeriodOptionLabel(year, semester)}) — isso só restringe a tabela abaixo; a
          publicação sempre usa o período de trabalho.
        </p>
      ) : null}
      {children}
    </div>
  );
}

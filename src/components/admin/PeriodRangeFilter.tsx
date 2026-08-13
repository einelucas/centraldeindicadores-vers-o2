"use client";

import { CalendarRange, FilterX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { MONTH_NAMES_FULL } from "@/lib/dates";
import {
  formatPeriodRangeLabel,
  getCurrentCycle,
  normalizePeriodRange,
  type PeriodRange,
} from "@/lib/period";

export function PeriodRangeFilter({
  value,
  onChange,
  yearsInData = [],
  showQuickActions = true,
  allowClear = true,
  label = "Período",
}: {
  value: PeriodRange | null;
  onChange: (next: PeriodRange | null) => void;
  yearsInData?: readonly number[];
  showQuickActions?: boolean;
  /** Mostra o botão "Tudo" (limpar para sem restrição). Desative quando o consumidor exige um intervalo concreto. */
  allowClear?: boolean;
  label?: string;
}) {
  const showLabel = label !== "";
  const draft = value ?? getCurrentCycle();
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(
    new Set([
      ...yearsInData,
      draft.startYear,
      draft.endYear,
      currentYear - 1,
      currentYear,
      currentYear + 1,
    ]),
  ).sort((a, b) => a - b);

  function update(next: Partial<PeriodRange>) {
    onChange(normalizePeriodRange({ ...draft, ...next }));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {showLabel ? <Label>{label}</Label> : null}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-muted/20 p-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            De
          </span>
          <div className="flex gap-1.5">
            <Select
              value={draft.startMonth}
              onChange={(event) => update({ startMonth: Number(event.target.value) })}
              className="w-28"
            >
              {MONTH_NAMES_FULL.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </Select>
            <Select
              value={draft.startYear}
              onChange={(event) => update({ startYear: Number(event.target.value) })}
              className="w-20"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Até
          </span>
          <div className="flex gap-1.5">
            <Select
              value={draft.endMonth}
              onChange={(event) => update({ endMonth: Number(event.target.value) })}
              className="w-28"
            >
              {MONTH_NAMES_FULL.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </Select>
            <Select
              value={draft.endYear}
              onChange={(event) => update({ endYear: Number(event.target.value) })}
              className="w-20"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {showQuickActions ? (
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(getCurrentCycle())}
            >
              <CalendarRange className="size-3.5" />
              Ciclo atual
            </Button>
            {allowClear && value ? (
              <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
                <FilterX className="size-3.5" />
                Tudo
              </Button>
            ) : null}
          </div>
        ) : null}

        <Badge variant={value ? "outline" : "secondary"} className="mb-1">
          {formatPeriodRangeLabel(value)}
        </Badge>
      </div>
    </div>
  );
}

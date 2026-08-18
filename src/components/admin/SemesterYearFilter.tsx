"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ReadingSemester } from "@/components/layout/ReadingContextCard";
import { cycleFromYearSemester, formatPeriodRangeLabel } from "@/lib/period";

/**
 * Seletor travado de Ano + Semestre (S1 dez–mai / S2 jun–nov) — único período
 * que a Administração pode usar para publicar. Substitui o antigo filtro
 * livre de mês/ano nesse papel; quem precisar olhar um recorte diferente dos
 * dados sem mudar o que vai ser publicado usa o botão "Consulta" ao lado.
 *
 * "Ano inicial" e "Ano final" são as duas pontas do mesmo ciclo — editar
 * qualquer um dos dois recalcula o outro a partir do semestre selecionado
 * (para S2 os dois são sempre iguais; para S1 o final é sempre inicial + 1).
 * Não existe uma quarta combinação possível, então nunca há uma seleção
 * "inválida": mudar um lado sempre ajusta o outro para o único valor
 * coerente com o semestre, em vez de deixar os dois dessincronizarem.
 */
export function SemesterYearFilter({
  year,
  semester,
  onChange,
  label = "Período de publicação",
}: {
  year: number;
  semester: ReadingSemester;
  onChange: (year: number, semester: ReadingSemester) => void;
  label?: string;
}) {
  const currentYear = new Date().getFullYear();
  const startYears = Array.from({ length: 6 }, (_, index) => currentYear + 1 - index);
  // Cobre todo ano final alcançável a partir de qualquer combinação de
  // startYears + semestre (inclusive startYears[0] + 1, o caso S1 mais alto).
  const endYears = Array.from({ length: 7 }, (_, index) => currentYear + 2 - index);
  const cycle = cycleFromYearSemester(year, semester);

  function handleEndYearChange(nextEndYear: number) {
    const nextStartYear = semester === "S1" ? nextEndYear - 1 : nextEndYear;
    onChange(nextStartYear, semester);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label ? <Label>{label}</Label> : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ano inicial
          </span>
          <Select
            value={year}
            onChange={(event) => onChange(Number(event.target.value), semester)}
            className="w-24"
            aria-label="Ano inicial"
          >
            {startYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Semestre
          </span>
          <Select
            value={semester}
            onChange={(event) => onChange(year, event.target.value as ReadingSemester)}
            className="w-32"
            aria-label="Semestre"
          >
            <option value="S2">Jun – Nov</option>
            <option value="S1">Dez – Mai</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ano final
          </span>
          <Select
            value={cycle.endYear}
            onChange={(event) => handleEndYearChange(Number(event.target.value))}
            className="w-24"
            aria-label="Ano final"
          >
            {endYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {/* Reforço em texto do mesmo intervalo já visível nos três seletores
          acima — evita a ambiguidade de publicar "S1 + ano" sem saber que
          meses exatos isso cobre. */}
      <p className="text-xs font-medium text-muted-foreground">
        Competência: {semester} {year} · Período: {formatPeriodRangeLabel(cycle)}
      </p>
    </div>
  );
}

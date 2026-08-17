"use client";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ReadingSemester } from "@/components/layout/ReadingContextCard";

/**
 * Seletor travado de Ano + Semestre (S1 dez–mai / S2 jun–nov) — único período
 * que a Administração pode usar para publicar. Substitui o antigo filtro
 * livre de mês/ano nesse papel; quem precisar olhar um recorte diferente dos
 * dados sem mudar o que vai ser publicado usa o botão "Consulta" ao lado.
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
  const years = Array.from({ length: 6 }, (_, index) => currentYear + 1 - index);

  return (
    <div className="flex flex-col gap-1.5">
      {label ? <Label>{label}</Label> : null}
      <div className="flex gap-2">
        <Select
          value={semester}
          onChange={(event) => onChange(year, event.target.value as ReadingSemester)}
          className="w-32"
        >
          <option value="S2">Jun – Nov</option>
          <option value="S1">Dez – Mai</option>
        </Select>
        <Select
          value={year}
          onChange={(event) => onChange(Number(event.target.value), semester)}
          className="w-24"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

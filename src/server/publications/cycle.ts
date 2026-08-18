import {
  cycleFromYearSemester,
  normalizePeriodRange,
  type PeriodRange,
  type Semester,
} from "@/lib/period";

export interface PublicationCycle {
  year: number;
  semester: Semester;
}

/**
 * Só resolve um ciclo quando o período bate exatamente com
 * `cycleFromYearSemester(ano, semestre)` para o ano do próprio período (ano
 * de término no caso de S1) — nunca com um range parcial/arbitrário. Usado
 * para decidir se uma publicação pode ser identificada por Ano+Semestre
 * (colunas `cycleYear`/`cycleSemester` de `IndicatorPublication`) ou se fica
 * só no `payload` (publicações "sem restrição", sem período, ou com um
 * recorte que não é um semestre inteiro).
 *
 * Reaproveita `cycleFromYearSemester` como única fonte de verdade — nunca
 * reimplementa a regra de qual mês pertence a qual semestre.
 */
export function resolvePublicationCycle(period: PeriodRange | null): PublicationCycle | null {
  if (!period) return null;
  const normalized = normalizePeriodRange(period);

  const candidates: PublicationCycle[] = [
    { year: normalized.startYear, semester: "S2" },
    { year: normalized.endYear, semester: "S1" },
  ];

  for (const candidate of candidates) {
    const cycle = cycleFromYearSemester(candidate.year, candidate.semester);
    if (
      cycle.startYear === normalized.startYear &&
      cycle.startMonth === normalized.startMonth &&
      cycle.endYear === normalized.endYear &&
      cycle.endMonth === normalized.endMonth
    ) {
      return candidate;
    }
  }

  return null;
}

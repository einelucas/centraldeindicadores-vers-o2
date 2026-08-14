/**
 * Cálculos do RDO. Funções puras e testáveis, migradas fielmente da
 * função renderRdo() do HTML original.
 *
 * Regras preservadas:
 *  - Só conta linhas com data válida E unidade preenchida (equivale ao COUNTA da data).
 *  - Aderência = aprovados / emitidos.
 *  - "Aprovado", "Revisar Relatório", "Preenchendo Relatório" são contados à parte.
 *  - Agregação por unidade e por mês (YYYY-MM).
 *  - Média das unidades = média simples das aderências por unidade (como no HTML).
 *  - Meta padrão 80%.
 */

import { MONTH_NAMES } from "@/lib/dates";
import { isWithinPeriodRange, type PeriodRange } from "@/lib/period";
import { normalizeRdoUnitCode } from "@/features/rdo/utils/units";
import {
  RDO_DEFAULT_TARGET,
  RDO_STATUS,
  type RdoMonthAggregate,
  type RdoNormalizedRecord,
  type RdoResult,
  type RdoUnitAggregate,
} from "@/features/rdo/types";

/**
 * Aderência do RDO. Migrado do padrão aprovados/emitidos usado no HTML.
 * Retorna 0 quando não há emitidos (evita divisão por zero), como no HTML.
 */
export function calculateRdoAdherence(approved: number, issued: number): number {
  if (issued === 0) return 0;
  return approved / issued;
}

/**
 * Consolida os registros do RDO em cards, tabela por unidade e por mês.
 * `threshold` é a meta fracionária (ex.: 0.80). Fiel a renderRdo().
 */
export function computeRdoResult(
  records: readonly RdoNormalizedRecord[],
  threshold: number = RDO_DEFAULT_TARGET,
  excludedUnits: readonly string[] = [],
  period: PeriodRange | null = null,
): RdoResult {
  const excludedNormalized = Array.from(
    new Set(excludedUnits.map(normalizeRdoUnitCode).filter(Boolean)),
  );
  const excludeSet = new Set(excludedNormalized);

  const byUnit = new Map<string, { emitidos: number; aprovados: number }>();
  const byMonth = new Map<string, { emitidos: number; aprovados: number; y: number; m: number }>();

  let totalEmitidos = 0;
  let totalAprovados = 0;
  let totalRevisar = 0;
  let totalPreenchendo = 0;

  for (const r of records) {
    const status = (r.statusDescricao ?? "").toString().trim();
    const unit = normalizeRdoUnitCode(r.empresaNome);
    // Fiel ao HTML: precisa de data válida e unidade.
    if (!r.dataReferencia || isNaN(r.dataReferencia.getTime()) || !unit) continue;
    // Corte estrutural: fora do período selecionado, o registro nem entra
    // em nenhuma tabela (diferente da exclusão de unidade, que mantém a
    // linha visível). Sem período definido, nada é restringido.
    if (
      period &&
      !isWithinPeriodRange(r.dataReferencia.getFullYear(), r.dataReferencia.getMonth() + 1, period)
    ) {
      continue;
    }

    // A tabela por unidade continua mostrando todas, inclusive as ignoradas.
    const u = byUnit.get(unit) ?? { emitidos: 0, aprovados: 0 };
    u.emitidos++;
    if (status === RDO_STATUS.APROVADO) u.aprovados++;
    byUnit.set(unit, u);

    if (excludeSet.has(unit)) continue;

    totalEmitidos++;
    if (status === RDO_STATUS.APROVADO) totalAprovados++;
    else if (status === RDO_STATUS.REVISAR) totalRevisar++;
    else if (status === RDO_STATUS.PREENCHENDO) totalPreenchendo++;

    const y = r.dataReferencia.getFullYear();
    const m = r.dataReferencia.getMonth(); // 0-based, como no HTML
    const key = y + "-" + String(m + 1).padStart(2, "0");
    const mm = byMonth.get(key) ?? { emitidos: 0, aprovados: 0, y, m };
    mm.emitidos++;
    if (status === RDO_STATUS.APROVADO) mm.aprovados++;
    byMonth.set(key, mm);
  }

  // Unidades ordenadas por emitidos (desc), como no HTML.
  const unitEntries = Array.from(byUnit.entries()).sort((a, b) => b[1].emitidos - a[1].emitidos);
  let unitAvgSum = 0;
  let unitAvgCount = 0;
  const units: RdoUnitAggregate[] = unitEntries.map(([name, d]) => {
    const ad = calculateRdoAdherence(d.aprovados, d.emitidos);
    const excluded = excludeSet.has(name);
    if (!excluded) {
      unitAvgSum += ad;
      unitAvgCount++;
    }
    return { name, emitidos: d.emitidos, aprovados: d.aprovados, aderencia: ad, excluded };
  });
  const unitAvg = unitAvgCount ? unitAvgSum / unitAvgCount : 0;

  // Meses ordenados cronologicamente, como no HTML.
  const monthEntries = Array.from(byMonth.entries()).sort(
    (a, b) => a[1].y - b[1].y || a[1].m - b[1].m,
  );
  const months: RdoMonthAggregate[] = monthEntries.map(([, d]) => ({
    label: (MONTH_NAMES[d.m] ?? "?") + "/" + d.y,
    year: d.y,
    month: d.m,
    emitidos: d.emitidos,
    aprovados: d.aprovados,
    aderencia: calculateRdoAdherence(d.aprovados, d.emitidos),
  }));

  return {
    threshold,
    excludedUnits: excludedNormalized,
    period,
    totalEmitidos,
    totalAprovados,
    totalRevisar,
    totalPreenchendo,
    units,
    unitAvg,
    months,
  };
}

/** true se a aderência atinge a meta. */
export function meetsTarget(adherence: number, threshold: number): boolean {
  return adherence >= threshold;
}

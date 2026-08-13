/**
 * Cálculos puros do RNC, preservados do HTML de referência.
 *
 * Regras:
 * - A coorte mensal é definida pela Data de Criação.
 * - Uma RNC conta como solucionada no mês da criação quando possui Data de Solução.
 * - Dias médios consideram apenas solucionadas com Tempo de Tratativa numérico.
 * - Aderência por unidade usa status TRATADA / criadas.
 * - O resultado consolidado é a média aritmética simples dos "dias médios"
 *   mensais válidos: cada mês tem peso 1, independentemente da quantidade de
 *   RNCs tratadas nele. Meses sem tratativa numérica não entram na conta.
 */

import { MONTH_NAMES } from "@/lib/dates";
import { isWithinPeriodRange, type PeriodRange } from "@/lib/period";
import {
  RNC_DEFAULT_MAX_DIAS,
  RNC_STATUS_TRATADA,
  type RncMonthAggregate,
  type RncNormalizedRecord,
  type RncOfensorAggregate,
  type RncResult,
  type RncUnitAggregate,
} from "@/features/rnc/types";
import { normalizeRncUnitCode } from "@/features/rnc/utils/units";

/**
 * Consolida os "dias médios" mensais em um único resultado pela média
 * aritmética simples: cada mês com resultado válido pesa 1, nenhum mês é
 * ponderado pela quantidade de RNCs elaboradas, tratadas ou por unidade.
 * Meses sem resultado válido (diasMedios null) não entram na soma nem no
 * denominador — nunca são tratados como zero.
 */
export function averageMonthlyRncDays(
  months: readonly Pick<RncMonthAggregate, "diasMedios">[],
): number | null {
  const validDays = months
    .map((month) => month.diasMedios)
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (validDays.length === 0) return null;

  return validDays.reduce((sum, value) => sum + value, 0) / validDays.length;
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2) return ordered[middle] ?? null;
  return ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2;
}

export function computeRncResult(
  records: readonly RncNormalizedRecord[],
  metaDias: number = RNC_DEFAULT_MAX_DIAS,
  excludedUnits: readonly string[] = [],
  period: PeriodRange | null = null,
): RncResult {
  const excludedNormalized = Array.from(
    new Set(excludedUnits.map(normalizeRncUnitCode).filter(Boolean)),
  );
  const excludeSet = new Set(excludedNormalized);

  const byMonth = new Map<
    string,
    {
      chamados: number;
      solucionados: number;
      tratativaSum: number;
      tratativaCount: number;
      y: number;
      m: number;
    }
  >();
  const byUnit = new Map<
    string,
    {
      criadas: number;
      tratadas: number;
      temposTratativa: number[];
      ofensores: Map<string, number>;
    }
  >();
  const byOfensor = new Map<string, number>();

  let totalCriadas = 0;
  let totalTratadas = 0;

  for (const record of records) {
    if (!record.dataCriacao || isNaN(record.dataCriacao.getTime())) continue;
    // Corte estrutural: fora do período selecionado, o registro nem entra
    // em nenhuma tabela. Sem período definido, nada é restringido.
    if (
      period &&
      !isWithinPeriodRange(
        record.dataCriacao.getFullYear(),
        record.dataCriacao.getMonth() + 1,
        period,
      )
    ) {
      continue;
    }

    const status = String(record.statusRnc ?? "")
      .trim()
      .toUpperCase();
    const unidade = normalizeRncUnitCode(record.unidade);
    const ofensor = String(record.ofensor ?? "").trim() || "N/A";
    const isExcluded = unidade !== "" && excludeSet.has(unidade);

    // A tabela por unidade continua mostrando todas, inclusive as ignoradas.
    if (unidade) {
      const unit = byUnit.get(unidade) ?? {
        criadas: 0,
        tratadas: 0,
        temposTratativa: [],
        ofensores: new Map<string, number>(),
      };
      unit.criadas++;
      if (status === RNC_STATUS_TRATADA) unit.tratadas++;
      unit.ofensores.set(ofensor, (unit.ofensores.get(ofensor) ?? 0) + 1);
      if (
        record.dataSolucao &&
        !isNaN(record.dataSolucao.getTime()) &&
        record.tempoTratativa !== null &&
        Number.isFinite(record.tempoTratativa)
      ) {
        unit.temposTratativa.push(record.tempoTratativa);
      }
      byUnit.set(unidade, unit);
    }

    if (isExcluded) continue;

    totalCriadas++;
    if (status === RNC_STATUS_TRATADA) totalTratadas++;
    byOfensor.set(ofensor, (byOfensor.get(ofensor) ?? 0) + 1);

    const year = record.dataCriacao.getFullYear();
    const month = record.dataCriacao.getMonth();
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    const aggregate = byMonth.get(key) ?? {
      chamados: 0,
      solucionados: 0,
      tratativaSum: 0,
      tratativaCount: 0,
      y: year,
      m: month,
    };
    aggregate.chamados++;

    if (record.dataSolucao && !isNaN(record.dataSolucao.getTime())) {
      aggregate.solucionados++;
      if (record.tempoTratativa !== null && Number.isFinite(record.tempoTratativa)) {
        aggregate.tratativaSum += record.tempoTratativa;
        aggregate.tratativaCount++;
      }
    }
    byMonth.set(key, aggregate);
  }

  const months: RncMonthAggregate[] = Array.from(byMonth.values())
    .sort((a, b) => a.y - b.y || a.m - b.m)
    .map((month) => {
      const diasMedios = month.tratativaCount ? month.tratativaSum / month.tratativaCount : null;
      return {
        label: `${MONTH_NAMES[month.m] ?? "?"}/${month.y}`,
        year: month.y,
        month: month.m,
        chamados: month.chamados,
        solucionados: month.solucionados,
        diasMedios,
        dentroMeta: diasMedios === null ? null : diasMedios <= metaDias,
      };
    });

  const units: RncUnitAggregate[] = Array.from(byUnit.entries())
    .sort((a, b) => b[1].criadas - a[1].criadas)
    .map(([name, data]) => {
      const principalOfensor = Array.from(data.ofensores.entries()).sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"),
      )[0];
      const tratativaSum = data.temposTratativa.reduce((sum, value) => sum + value, 0);
      return {
        name,
        criadas: data.criadas,
        tratadas: data.tratadas,
        aderencia: data.criadas ? data.tratadas / data.criadas : 0,
        diasMedios: data.temposTratativa.length ? tratativaSum / data.temposTratativa.length : null,
        diasMedianos: median(data.temposTratativa),
        tratativasComTempo: data.temposTratativa.length,
        maiorTempoTratativa: data.temposTratativa.length ? Math.max(...data.temposTratativa) : null,
        principalOfensor: principalOfensor?.[0] ?? null,
        principalOfensorCount: principalOfensor?.[1] ?? 0,
        excluded: excludeSet.has(name),
      };
    });

  const totalOfensor = Array.from(byOfensor.values()).reduce((sum, value) => sum + value, 0);
  const ofensores: RncOfensorAggregate[] = Array.from(byOfensor.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      pct: totalOfensor ? count / totalOfensor : 0,
    }));

  const resultadoDias = averageMonthlyRncDays(months);

  return {
    metaDias,
    excludedUnits: excludedNormalized,
    period,
    totalCriadas,
    totalTratadas,
    aderenciaTotal: totalCriadas ? totalTratadas / totalCriadas : 0,
    resultadoDias,
    months,
    units,
    ofensores,
  };
}

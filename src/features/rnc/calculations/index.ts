/**
 * Cálculos puros do RNC, preservados do HTML de referência.
 *
 * Regras:
 * - A coorte mensal é definida pela Data de Criação.
 * - Uma RNC conta como solucionada no mês da criação quando possui Data de Solução.
 * - Dias médios consideram apenas solucionadas com Tempo de Tratativa numérico.
 * - Aderência por unidade usa status TRATADA / criadas.
 * - O resultado publicado é a média ponderada dos dias mensais pela quantidade
 *   de solucionadas de cada mês.
 */

import { MONTH_NAMES } from "@/lib/dates";
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

export function computeRncResult(
  records: readonly RncNormalizedRecord[],
  metaDias: number = RNC_DEFAULT_MAX_DIAS,
): RncResult {
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
  const byUnit = new Map<string, { criadas: number; tratadas: number }>();
  const byOfensor = new Map<string, number>();

  let totalCriadas = 0;
  let totalTratadas = 0;

  for (const record of records) {
    if (!record.dataCriacao || isNaN(record.dataCriacao.getTime())) continue;

    const status = String(record.statusRnc ?? "").trim().toUpperCase();
    const unidade = normalizeRncUnitCode(record.unidade);
    const ofensor = String(record.ofensor ?? "").trim() || "N/A";

    totalCriadas++;
    if (unidade) {
      const unit = byUnit.get(unidade) ?? { criadas: 0, tratadas: 0 };
      unit.criadas++;
      byUnit.set(unidade, unit);
    }
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
      if (
        record.tempoTratativa !== null &&
        Number.isFinite(record.tempoTratativa)
      ) {
        aggregate.tratativaSum += record.tempoTratativa;
        aggregate.tratativaCount++;
      }
    }
    byMonth.set(key, aggregate);

    if (status === RNC_STATUS_TRATADA) {
      totalTratadas++;
      if (unidade) {
        const unit = byUnit.get(unidade);
        if (unit) unit.tratadas++;
      }
    }
  }

  const months: RncMonthAggregate[] = Array.from(byMonth.values())
    .sort((a, b) => a.y - b.y || a.m - b.m)
    .map((month) => {
      const diasMedios = month.tratativaCount
        ? month.tratativaSum / month.tratativaCount
        : null;
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
    .map(([name, data]) => ({
      name,
      criadas: data.criadas,
      tratadas: data.tratadas,
      aderencia: data.criadas ? data.tratadas / data.criadas : 0,
    }));

  const totalOfensor = Array.from(byOfensor.values()).reduce(
    (sum, value) => sum + value,
    0,
  );
  const ofensores: RncOfensorAggregate[] = Array.from(byOfensor.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      pct: totalOfensor ? count / totalOfensor : 0,
    }));

  const monthsWithDays = months.filter(
    (month): month is RncMonthAggregate & { diasMedios: number } =>
      month.diasMedios !== null,
  );
  const solvedWeight = monthsWithDays.reduce(
    (sum, month) => sum + month.solucionados,
    0,
  );
  const resultadoDias = solvedWeight
    ? monthsWithDays.reduce(
        (sum, month) => sum + month.diasMedios * month.solucionados,
        0,
      ) / solvedWeight
    : monthsWithDays.length
      ? monthsWithDays.reduce((sum, month) => sum + month.diasMedios, 0) /
        monthsWithDays.length
      : null;

  return {
    metaDias,
    totalCriadas,
    totalTratadas,
    aderenciaTotal: totalCriadas ? totalTratadas / totalCriadas : 0,
    resultadoDias,
    months,
    units,
    ofensores,
  };
}

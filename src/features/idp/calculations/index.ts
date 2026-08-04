/**
 * Cálculos do IDP. Funções puras, migradas de combineAndRenderIdp() do HTML.
 *
 * Regras preservadas:
 *  - Aderência = custo real / custo da linha de base (0 se LB = 0).
 *  - Agrega por unidade, disciplina e mês.
 *  - Meta = mínimo para pontuar (comparação >= meta), padrão 90%.
 *  - Civil = código 01; Mecânica = 02; EIA = 04 + 05 + 06.
 */

import { MONTH_NAMES_FULL } from "@/lib/dates";
import {
  IDP_DEFAULT_TARGET,
  type IdpAggregate,
  type IdpDetailedResult,
  type IdpDisciplineGroupAggregate,
  type IdpNormalizedRecord,
  type IdpResult,
  type IdpSemesterDisciplineDetail,
  type IdpUnitDetail,
} from "@/features/idp/types";

/** Aderência de custo. Retorna 0 quando não há linha de base. */
export function calculateIdpAdherence(real: number, linhaBase: number): number {
  if (linhaBase === 0) return 0;
  return real / linhaBase;
}

/** Extrai o código numérico prefixado no nome da disciplina. */
export function disciplineSortKey(name: string): number {
  const m = String(name ?? "").match(/^(\d+)/);
  return m ? parseInt(m[1]!, 10) : 999;
}

function toAggregate(
  name: string,
  value: { lb: number; real: number },
): IdpAggregate {
  return {
    name,
    custoLinhaBase: value.lb,
    custoReal: value.real,
    aderencia: calculateIdpAdherence(value.real, value.lb),
  };
}

/** Consolida os registros do IDP por unidade e disciplina. */
export function computeIdpResult(
  records: readonly IdpNormalizedRecord[],
  threshold: number = IDP_DEFAULT_TARGET,
): IdpResult {
  const byUnit = new Map<string, { lb: number; real: number }>();
  const byDisc = new Map<string, { lb: number; real: number }>();

  let totalLinhaBase = 0;
  let totalReal = 0;

  for (const r of records) {
    const unit = String(r.unit ?? "").trim();
    const disc = String(r.disciplina ?? "").trim();
    if (!unit || !disc) continue;

    const lb = Number(r.custoLinhaBase) || 0;
    const real = Number(r.custoReal) || 0;

    totalLinhaBase += lb;
    totalReal += real;

    const u = byUnit.get(unit) ?? { lb: 0, real: 0 };
    u.lb += lb;
    u.real += real;
    byUnit.set(unit, u);

    const d = byDisc.get(disc) ?? { lb: 0, real: 0 };
    d.lb += lb;
    d.real += real;
    byDisc.set(disc, d);
  }

  const units = Array.from(byUnit.entries())
    .map(([name, value]) => toAggregate(name, value))
    .sort((a, b) => b.custoReal - a.custoReal || a.name.localeCompare(b.name, "pt-BR"));

  const disciplinas = Array.from(byDisc.entries())
    .map(([name, value]) => toAggregate(name, value))
    .sort(
      (a, b) =>
        disciplineSortKey(a.name) - disciplineSortKey(b.name) ||
        a.name.localeCompare(b.name, "pt-BR"),
    );

  return {
    threshold,
    totalLinhaBase,
    totalReal,
    aderenciaGeral: calculateIdpAdherence(totalReal, totalLinhaBase),
    units,
    disciplinas,
  };
}

function disciplineGroup(
  key: IdpDisciplineGroupAggregate["key"],
  label: string,
  codes: number[],
  disciplinas: readonly IdpAggregate[],
): IdpDisciplineGroupAggregate {
  let custoLinhaBase = 0;
  let custoReal = 0;

  for (const disciplina of disciplinas) {
    if (!codes.includes(disciplineSortKey(disciplina.name))) continue;
    custoLinhaBase += disciplina.custoLinhaBase;
    custoReal += disciplina.custoReal;
  }

  return {
    key,
    label,
    codes,
    custoLinhaBase,
    custoReal,
    aderencia: calculateIdpAdherence(custoReal, custoLinhaBase),
    hasData: custoLinhaBase !== 0 || custoReal !== 0,
  };
}

/**
 * Calcula a visão completa do IDP para um ano e intervalo de meses.
 * Todos os valores vêm dos registros recebidos; não há preenchimento artificial.
 */
export function computeIdpDetailedResult(
  records: readonly IdpNormalizedRecord[],
  options: {
    year: number;
    monthStart: number;
    monthEnd: number;
    threshold?: number;
  },
): IdpDetailedResult {
  const threshold = options.threshold ?? IDP_DEFAULT_TARGET;
  const monthStart = Math.max(1, Math.min(12, Math.min(options.monthStart, options.monthEnd)));
  const monthEnd = Math.max(1, Math.min(12, Math.max(options.monthStart, options.monthEnd)));
  const selected = records.filter(
    (record) =>
      record.year === options.year &&
      record.month >= monthStart &&
      record.month <= monthEnd,
  );

  const base = computeIdpResult(selected, threshold);

  const byMonth = new Map<number, { lb: number; real: number }>();
  const byUnitDetail = new Map<
    string,
    Map<string, Map<number, { lb: number; real: number }>>
  >();

  for (const record of selected) {
    const monthValue = byMonth.get(record.month) ?? { lb: 0, real: 0 };
    monthValue.lb += Number(record.custoLinhaBase) || 0;
    monthValue.real += Number(record.custoReal) || 0;
    byMonth.set(record.month, monthValue);

    let discMap = byUnitDetail.get(record.unit);
    if (!discMap) {
      discMap = new Map();
      byUnitDetail.set(record.unit, discMap);
    }
    let monthMap = discMap.get(record.disciplina);
    if (!monthMap) {
      monthMap = new Map();
      discMap.set(record.disciplina, monthMap);
    }
    const current = monthMap.get(record.month) ?? { lb: 0, real: 0 };
    current.lb += Number(record.custoLinhaBase) || 0;
    current.real += Number(record.custoReal) || 0;
    monthMap.set(record.month, current);
  }

  const monthly = Array.from(byMonth.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([month, value]) => ({
      year: options.year,
      month,
      label: `${MONTH_NAMES_FULL[month - 1]}/${options.year}`,
      custoLinhaBase: value.lb,
      custoReal: value.real,
      aderencia: calculateIdpAdherence(value.real, value.lb),
    }));

  const unitDetails: IdpUnitDetail[] = Array.from(byUnitDetail.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .map(([unit, discMap]) => {
      const months = Array.from(
        new Set(
          Array.from(discMap.values()).flatMap((monthMap) =>
            Array.from(monthMap.keys()),
          ),
        ),
      )
        .sort((a, b) => a - b)
        .map((month) => ({
          year: options.year,
          month,
          label: MONTH_NAMES_FULL[month - 1] ?? String(month),
        }));

      const rows = Array.from(discMap.entries())
        .sort(
          (a, b) =>
            disciplineSortKey(a[0]) - disciplineSortKey(b[0]) ||
            a[0].localeCompare(b[0], "pt-BR"),
        )
        .map(([disciplina, monthMap]) => {
          let totalLinhaBase = 0;
          let totalReal = 0;
          const values = months.map(({ month }) => {
            const value = monthMap.get(month) ?? { lb: 0, real: 0 };
            totalLinhaBase += value.lb;
            totalReal += value.real;
            return {
              year: options.year,
              month,
              custoLinhaBase: value.lb,
              custoReal: value.real,
              aderencia: calculateIdpAdherence(value.real, value.lb),
            };
          });
          return {
            disciplina,
            values,
            totalLinhaBase,
            totalReal,
            aderencia: calculateIdpAdherence(totalReal, totalLinhaBase),
          };
        });

      return { unit, months, rows };
    });

  return {
    ...base,
    selectedYear: options.year,
    monthStart,
    monthEnd,
    monthly,
    groups: {
      civil: disciplineGroup("civil", "Civil", [1], base.disciplinas),
      mecanica: disciplineGroup("mecanica", "Mecânica", [2], base.disciplinas),
      eia: disciplineGroup("eia", "EIA", [4, 5, 6], base.disciplinas),
    },
    unitDetails,
  };
}

/**
 * Consolida, por disciplina e mês, os dois semestres operacionais do IDP.
 *
 * O ano informado é o ano de referência do filtro geral:
 *  - Dezembro do ano anterior a Maio do ano selecionado;
 *  - Junho a Novembro do ano selecionado.
 *
 * Cada célula soma Linha de Base e Real de todas as unidades antes de calcular
 * a aderência. Os seis meses são mantidos na tabela mesmo quando não há dados,
 * evitando que a estrutura mude durante o semestre.
 */
export function computeIdpSemesterDisciplineDetails(
  records: readonly IdpNormalizedRecord[],
  referenceYear: number,
): IdpSemesterDisciplineDetail[] {
  const definitions: Array<{
    key: IdpSemesterDisciplineDetail["key"];
    label: string;
    months: Array<{ year: number; month: number }>;
  }> = [
    {
      key: "dec-may",
      label: "Dezembro a maio",
      months: [
        { year: referenceYear - 1, month: 12 },
        ...Array.from({ length: 5 }, (_, index) => ({
          year: referenceYear,
          month: index + 1,
        })),
      ],
    },
    {
      key: "jun-nov",
      label: "Junho a novembro",
      months: Array.from({ length: 6 }, (_, index) => ({
        year: referenceYear,
        month: index + 6,
      })),
    },
  ];

  return definitions.map((definition) => {
    const monthKeys = new Set(
      definition.months.map(({ year, month }) => `${year}-${month}`),
    );
    const byDiscipline = new Map<
      string,
      Map<string, { lb: number; real: number }>
    >();

    for (const record of records) {
      const disciplina = String(record.disciplina ?? "").trim();
      const key = `${record.year}-${record.month}`;
      if (!disciplina || !monthKeys.has(key)) continue;

      let monthMap = byDiscipline.get(disciplina);
      if (!monthMap) {
        monthMap = new Map();
        byDiscipline.set(disciplina, monthMap);
      }

      const current = monthMap.get(key) ?? { lb: 0, real: 0 };
      current.lb += Number(record.custoLinhaBase) || 0;
      current.real += Number(record.custoReal) || 0;
      monthMap.set(key, current);
    }

    const months = definition.months.map(({ year, month }) => ({
      year,
      month,
      label: `${MONTH_NAMES_FULL[month - 1] ?? String(month)}/${year}`,
    }));

    let totalLinhaBase = 0;
    let totalReal = 0;
    const rows = Array.from(byDiscipline.entries())
      .sort(
        (a, b) =>
          disciplineSortKey(a[0]) - disciplineSortKey(b[0]) ||
          a[0].localeCompare(b[0], "pt-BR"),
      )
      .map(([disciplina, monthMap]) => {
        let rowLinhaBase = 0;
        let rowReal = 0;
        const values = months.map(({ year, month }) => {
          const value = monthMap.get(`${year}-${month}`) ?? { lb: 0, real: 0 };
          rowLinhaBase += value.lb;
          rowReal += value.real;
          return {
            year,
            month,
            custoLinhaBase: value.lb,
            custoReal: value.real,
            aderencia: calculateIdpAdherence(value.real, value.lb),
          };
        });

        totalLinhaBase += rowLinhaBase;
        totalReal += rowReal;

        return {
          disciplina,
          values,
          totalLinhaBase: rowLinhaBase,
          totalReal: rowReal,
          aderencia: calculateIdpAdherence(rowReal, rowLinhaBase),
        };
      });

    const firstMonth = months[0]!;
    const lastMonth = months.at(-1)!;

    return {
      key: definition.key,
      label: definition.label,
      periodLabel: `${MONTH_NAMES_FULL[firstMonth.month - 1]}/${firstMonth.year} a ${MONTH_NAMES_FULL[lastMonth.month - 1]}/${lastMonth.year}`,
      referenceYear,
      months,
      rows,
      totalLinhaBase,
      totalReal,
      aderencia: calculateIdpAdherence(totalReal, totalLinhaBase),
    };
  });
}

/** true se a aderência atinge a meta. */
export function meetsTarget(adherence: number, threshold: number): boolean {
  return adherence >= threshold;
}

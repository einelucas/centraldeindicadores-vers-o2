import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const monthly = [
  { year: 2026, month: 6, rate: 6.2, caf: 3, faixa: "ABAIXO" },
  { year: 2026, month: 7, rate: 7.5, caf: 5, faixa: "NA_META" },
  { year: 2026, month: 8, rate: 9.4, caf: 8, faixa: "ACIMA" },
  { year: 2026, month: 9, rate: 5.9, caf: 2, faixa: "ABAIXO" },
  { year: 2026, month: 10, rate: 7.4, caf: 4, faixa: "NA_META" },
  { year: 2026, month: 11, rate: 8.7, caf: 7, faixa: "ACIMA" },
  { year: 2026, month: 12, rate: 6.6, caf: 3, faixa: "ABAIXO" },
  { year: 2027, month: 1, rate: 7.5, caf: 5, faixa: "NA_META" },
  { year: 2027, month: 2, rate: 10.2, caf: 9, faixa: "ACIMA" },
  { year: 2027, month: 3, rate: 5.7, caf: 2, faixa: "ABAIXO" },
  { year: 2027, month: 4, rate: 7.3, caf: 4, faixa: "NA_META" },
  { year: 2027, month: 5, rate: 8.9, caf: 8, faixa: "ACIMA" },
];

const unitDistribution = [
  [
    [1, 2],
    [1, 1],
    [1, 1],
  ],
  [
    [2, 2],
    [2, 2],
    [1, 1],
  ],
  [
    [3, 4],
    [3, 3],
    [2, 2],
  ],
  [
    [1, 1],
    [1, 1],
    [0, 1],
  ],
  [
    [2, 2],
    [1, 2],
    [1, 1],
  ],
  [
    [3, 4],
    [2, 3],
    [2, 2],
  ],
  [
    [1, 1],
    [1, 2],
    [1, 1],
  ],
  [
    [2, 2],
    [2, 2],
    [1, 2],
  ],
  [
    [4, 5],
    [3, 4],
    [2, 3],
  ],
  [
    [1, 1],
    [1, 1],
    [0, 1],
  ],
  [
    [2, 2],
    [1, 2],
    [1, 1],
  ],
  [
    [3, 4],
    [3, 3],
    [2, 3],
  ],
];

const units = [
  { unit: "RVD", unitKey: "RVD" },
  { unit: "RDN", unitKey: "RDN" },
  { unit: "MTU", unitKey: "MTU" },
];

const unitRows = monthly.flatMap((period, periodIndex) =>
  units.map((unit, unitIndex) => {
    const [caf, saf] = unitDistribution[periodIndex][unitIndex];
    return { year: period.year, month: period.month, ...unit, caf, saf };
  }),
);

for (const period of monthly) {
  const distributedCaf = unitRows
    .filter((row) => row.year === period.year && row.month === period.month)
    .reduce((sum, row) => sum + row.caf, 0);
  if (distributedCaf !== period.caf) {
    throw new Error(
      `Distribuição CAF inconsistente em ${period.year}-${String(period.month).padStart(2, "0")}.`,
    );
  }
}

const periodWhere = {
  OR: [
    { year: 2026, month: { gte: 6 } },
    { year: 2027, month: { lte: 5 } },
  ],
};

async function main() {
  const [existingMonthly, existingUnits] = await Promise.all([
    prisma.accidentMonthlyRecord.findMany({
      where: periodWhere,
      orderBy: [{ year: "asc" }, { month: "asc" }],
      select: { year: true, month: true, rate: true, caf: true },
    }),
    prisma.accidentUnitRecord.findMany({
      where: { ...periodWhere, unitKey: { in: units.map((unit) => unit.unitKey) } },
      orderBy: [{ year: "asc" }, { month: "asc" }, { unit: "asc" }],
      select: { year: true, month: true, unit: true, unitKey: true, caf: true, saf: true },
    }),
  ]);

  const monthlyKeys = new Set(existingMonthly.map((row) => `${row.year}-${row.month}`));
  const unitKeys = new Set(existingUnits.map((row) => `${row.year}-${row.month}-${row.unitKey}`));
  const monthlyToCreate = monthly
    .filter((row) => !monthlyKeys.has(`${row.year}-${row.month}`))
    .map(({ faixa: _faixa, ...row }) => row);
  const unitsToCreate = unitRows.filter(
    (row) => !unitKeys.has(`${row.year}-${row.month}-${row.unitKey}`),
  );

  console.log(
    JSON.stringify(
      {
        modo: apply ? "APLICAR" : "SIMULAÇÃO",
        periodo: "Jun/2026 a Mai/2027",
        unidades: units.map((unit) => unit.unit),
        planejado: { mensais: monthly.length, porUnidade: unitRows.length },
        existentes: { mensais: existingMonthly.length, porUnidade: existingUnits.length },
        novos: { mensais: monthlyToCreate.length, porUnidade: unitsToCreate.length },
        faixasPlanejadas: monthly.reduce((acc, row) => {
          acc[row.faixa] = (acc[row.faixa] ?? 0) + 1;
          return acc;
        }, {}),
        competenciasMensaisPreservadas: existingMonthly,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Simulação concluída. Use --apply para inserir apenas os registros ausentes.");
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const monthlyResult = monthlyToCreate.length
      ? await tx.accidentMonthlyRecord.createMany({ data: monthlyToCreate, skipDuplicates: true })
      : { count: 0 };
    const unitResult = unitsToCreate.length
      ? await tx.accidentUnitRecord.createMany({ data: unitsToCreate, skipDuplicates: true })
      : { count: 0 };

    if (monthlyResult.count || unitResult.count) {
      await tx.auditLog.create({
        data: {
          action: "TEST_DATA_SEEDED",
          entity: "AccidentRate",
          entityId: "2026-06_2027-05",
          newData: {
            monthlyInserted: monthlyResult.count,
            unitRowsInserted: unitResult.count,
          },
          metadata: {
            module: "taxa-acidentes",
            synthetic: true,
            units: units.map((unit) => unit.unit),
            startYear: 2026,
            startMonth: 6,
            endYear: 2027,
            endMonth: 5,
          },
        },
      });
    }

    return { monthly: monthlyResult.count, units: unitResult.count };
  });

  console.log(`Carga concluída: ${result.monthly} mensal(is) e ${result.units} por unidade.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

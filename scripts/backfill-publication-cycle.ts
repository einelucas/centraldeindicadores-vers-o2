/**
 * Preenche cycleYear/cycleSemester/periodStart.../periodEnd... nas
 * publicações já existentes, lendo o período de dentro do payload (mesma
 * função usada em runtime — nenhuma regra nova, nenhum risco de divergência
 * entre backfill e leitura/publicação).
 *
 * Publicações cujo payload não tem um período reconhecível, ou cujo período
 * não é um semestre canônico completo, ficam com as colunas novas nulas —
 * tratado como "legado sem ciclo definido" pelo código de leitura
 * (src/server/publications/period-selection.ts).
 *
 * Uso: pnpm db:backfill:publication-cycle
 */

import { PrismaClient } from "@prisma/client";
import { publicationPeriod, type PublishedModule } from "../src/server/publications/period-selection";
import { resolvePublicationCycle } from "../src/server/publications/cycle";

const prisma = new PrismaClient();

const KNOWN_MODULES: readonly PublishedModule[] = [
  "rdo",
  "idp",
  "rnc",
  "cinco-s",
  "taxa-acidentes",
];

function isPublishedModule(value: string): value is PublishedModule {
  return (KNOWN_MODULES as readonly string[]).includes(value);
}

async function main() {
  const publications = await prisma.indicatorPublication.findMany({
    select: { id: true, module: true, payload: true },
  });

  let updated = 0;
  let skippedUnknownModule = 0;
  let skippedNoPeriod = 0;

  for (const publication of publications) {
    if (!isPublishedModule(publication.module)) {
      skippedUnknownModule += 1;
      console.warn(`⚠ módulo desconhecido "${publication.module}" (id ${publication.id}) — pulando.`);
      continue;
    }

    const period = publicationPeriod(publication.module, publication.payload);
    const cycle = resolvePublicationCycle(period);

    if (!cycle || !period) {
      skippedNoPeriod += 1;
      continue;
    }

    await prisma.indicatorPublication.update({
      where: { id: publication.id },
      data: {
        cycleYear: cycle.year,
        cycleSemester: cycle.semester,
        periodStartYear: period.startYear,
        periodStartMonth: period.startMonth,
        periodEndYear: period.endYear,
        periodEndMonth: period.endMonth,
      },
    });
    updated += 1;
  }

  console.log(`✓ ${updated} publicação(ões) atualizada(s) com ciclo resolvido.`);
  if (skippedNoPeriod) {
    console.log(
      `  ${skippedNoPeriod} publicação(ões) sem período reconhecível ou não-semestral — mantidas com colunas nulas (legado).`,
    );
  }
  if (skippedUnknownModule) {
    console.log(`  ${skippedUnknownModule} publicação(ões) de módulo desconhecido — puladas.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

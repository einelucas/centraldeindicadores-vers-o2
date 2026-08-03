/**
 * Repositório do IDP. Isola o Prisma e implementa o RecordDelegate do motor
 * de importação incremental. Roda dentro de uma transação passada pelo serviço.
 */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import type {
  IncrementalRecord,
  RecordDelegate,
} from "@/importers/shared/incremental-upsert";

type Tx = Prisma.TransactionClient;

interface IdpData {
  unit: string;
  year: number;
  month: number;
  disciplina: string;
  custoLinhaBase: number;
  custoReal: number;
  raw: Record<string, unknown>;
}

export function createIdpDelegate(tx: Tx): RecordDelegate {
  return {
    async findByBusinessKey(businessKey: string) {
      return tx.idpRecord.findUnique({
        where: { businessKey },
        select: { contentHash: true },
      });
    },

    async insert(record: IncrementalRecord, importId: string) {
      const d = record.data as unknown as IdpData;
      await tx.idpRecord.create({
        data: {
          businessKey: record.businessKey,
          contentHash: record.contentHash,
          unit: d.unit,
          year: d.year,
          month: d.month,
          disciplina: d.disciplina,
          custoLinhaBase: d.custoLinhaBase,
          custoReal: d.custoReal,
          raw: toJsonValue(d.raw),
          firstImportId: importId,
          lastImportId: importId,
        },
      });
    },

    async update(record: IncrementalRecord, importId: string) {
      const d = record.data as unknown as IdpData;
      await tx.idpRecord.update({
        where: { businessKey: record.businessKey },
        data: {
          contentHash: record.contentHash,
          custoLinhaBase: d.custoLinhaBase,
          custoReal: d.custoReal,
          raw: toJsonValue(d.raw),
          lastImportId: importId,
          lastSeenAt: new Date(),
        },
      });
    },
  };
}

/** Lê registros IDP (opcionalmente de um período) para recálculo. */
export async function loadIdpRecords(
  tx: Tx,
  filter?: { year?: number; month?: number },
) {
  return tx.idpRecord.findMany({
    where: { year: filter?.year, month: filter?.month },
    orderBy: [{ unit: "asc" }, { disciplina: "asc" }],
  });
}

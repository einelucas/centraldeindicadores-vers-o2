/**
 * Repositório do 5S. Isola o Prisma e implementa o RecordDelegate do motor
 * incremental. Roda dentro de uma transação passada pelo serviço.
 */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import { aderenciaUnidade } from "@/features/cinco-s/calculations";
import type { FiveSArea } from "@/features/cinco-s/types";
import type {
  IncrementalRecord,
  RecordDelegate,
} from "@/importers/shared/incremental-upsert";

type Tx = Prisma.TransactionClient;

interface FiveSData {
  unit: string;
  year: number;
  month: number;
  areas: FiveSArea[];
  raw: Record<string, unknown>;
}

export function createFiveSDelegate(tx: Tx): RecordDelegate {
  return {
    async findByBusinessKey(businessKey: string) {
      return tx.fiveSRecord.findUnique({
        where: { businessKey },
        select: { contentHash: true },
      });
    },
    async insert(record: IncrementalRecord, importId: string) {
      const d = record.data as unknown as FiveSData;
      await tx.fiveSRecord.create({
        data: {
          businessKey: record.businessKey,
          contentHash: record.contentHash,
          unit: d.unit,
          year: d.year,
          month: d.month,
          aderencia: aderenciaUnidade(d.areas),
          areasCount: d.areas.length,
          // Guarda as áreas dentro do raw para o recálculo/detalhe.
          raw: toJsonValue({ ...d.raw, areas: d.areas }),
          firstImportId: importId,
          lastImportId: importId,
        },
      });
    },
    async update(record: IncrementalRecord, importId: string) {
      const d = record.data as unknown as FiveSData;
      await tx.fiveSRecord.update({
        where: { businessKey: record.businessKey },
        data: {
          contentHash: record.contentHash,
          aderencia: aderenciaUnidade(d.areas),
          areasCount: d.areas.length,
          raw: toJsonValue({ ...d.raw, areas: d.areas }),
          lastImportId: importId,
          lastSeenAt: new Date(),
        },
      });
    },
  };
}

export async function loadFiveSRecords(tx: Tx) {
  return tx.fiveSRecord.findMany({
    orderBy: [{ year: "asc" }, { month: "asc" }, { unit: "asc" }],
  });
}

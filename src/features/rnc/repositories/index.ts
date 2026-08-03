/**
 * Repositório do RNC. Isola o Prisma e implementa o RecordDelegate do motor
 * incremental. Roda dentro de uma transação passada pelo serviço.
 */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import type {
  IncrementalRecord,
  RecordDelegate,
} from "@/importers/shared/incremental-upsert";

type Tx = Prisma.TransactionClient;

interface RncData {
  statusRnc: string;
  unidade: string;
  dataCriacao: string | Date;
  dataSolucao: string | Date | null;
  tempoTratativa: number | null;
  ofensor: string;
  year: number;
  month: number;
  raw: Record<string, unknown>;
}

function toDate(v: string | Date | null): Date | null {
  if (v === null) return null;
  return v instanceof Date ? v : new Date(v);
}

export function createRncDelegate(tx: Tx): RecordDelegate {
  return {
    async findByBusinessKey(businessKey: string) {
      return tx.rncRecord.findUnique({
        where: { businessKey },
        select: { contentHash: true },
      });
    },

    async insert(record: IncrementalRecord, importId: string) {
      const d = record.data as unknown as RncData;
      await tx.rncRecord.create({
        data: {
          businessKey: record.businessKey,
          contentHash: record.contentHash,
          statusRnc: d.statusRnc,
          unidade: d.unidade,
          dataCriacao: toDate(d.dataCriacao) ?? new Date(),
          dataSolucao: toDate(d.dataSolucao),
          tempoTratativa: d.tempoTratativa,
          ofensor: d.ofensor,
          year: d.year,
          month: d.month,
          raw: toJsonValue(d.raw),
          firstImportId: importId,
          lastImportId: importId,
        },
      });
    },

    async update(record: IncrementalRecord, importId: string) {
      const d = record.data as unknown as RncData;
      await tx.rncRecord.update({
        where: { businessKey: record.businessKey },
        data: {
          contentHash: record.contentHash,
          statusRnc: d.statusRnc,
          dataSolucao: toDate(d.dataSolucao),
          tempoTratativa: d.tempoTratativa,
          raw: toJsonValue(d.raw),
          lastImportId: importId,
          lastSeenAt: new Date(),
        },
      });
    },
  };
}

export async function loadRncRecords(tx: Tx) {
  return tx.rncRecord.findMany({ orderBy: { dataCriacao: "asc" } });
}

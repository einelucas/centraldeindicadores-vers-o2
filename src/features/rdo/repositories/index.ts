/**
 * Repositório do RDO. Isola o acesso ao Prisma e implementa o RecordDelegate
 * usado pelo motor de importação incremental.
 *
 * A operação roda dentro de uma transação Prisma (tx) passada pelo serviço.
 */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import type {
  IncrementalRecord,
  RecordDelegate,
} from "@/importers/shared/incremental-upsert";

type Tx = Prisma.TransactionClient;

interface RdoData {
  dataReferencia: Date;
  empresaNome: string;
  statusDescricao: string;
  relatorioId: string | null;
  grupo: string | null;
  disciplina: string | null;
  year: number;
  month: number;
  raw: Record<string, unknown>;
}

export function createRdoDelegate(tx: Tx): RecordDelegate {
  return {
    async findByBusinessKey(businessKey: string) {
      return tx.rdoRecord.findUnique({
        where: { businessKey },
        select: { contentHash: true },
      });
    },

    async insert(record: IncrementalRecord, importId: string) {
      const d = record.data as unknown as RdoData;
      await tx.rdoRecord.create({
        data: {
          businessKey: record.businessKey,
          contentHash: record.contentHash,
          dataReferencia: d.dataReferencia,
          empresaNome: d.empresaNome,
          statusDescricao: d.statusDescricao,
          relatorioId: d.relatorioId,
          grupo: d.grupo,
          disciplina: d.disciplina,
          year: d.year,
          month: d.month,
          raw: toJsonValue(d.raw),
          firstImportId: importId,
          lastImportId: importId,
        },
      });
    },

    async update(record: IncrementalRecord, importId: string) {
      const d = record.data as unknown as RdoData;
      await tx.rdoRecord.update({
        where: { businessKey: record.businessKey },
        data: {
          contentHash: record.contentHash,
          statusDescricao: d.statusDescricao,
          raw: toJsonValue(d.raw),
          lastImportId: importId,
          lastSeenAt: new Date(),
        },
      });
    },
  };
}

/** Lê todos os registros de RDO de um período para recálculo de indicadores. */
export async function loadRdoRecords(
  tx: Tx,
  filter?: { year?: number; month?: number },
) {
  return tx.rdoRecord.findMany({
    where: {
      year: filter?.year,
      month: filter?.month,
    },
    orderBy: { dataReferencia: "asc" },
  });
}

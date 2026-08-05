/** Repositório dos documentos RSO do IDP. */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import type { IncrementalRecord, RecordDelegate } from "@/importers/shared/incremental-upsert";
import type { IdpNormalizedRecord } from "@/features/idp/types";

type Tx = Prisma.TransactionClient;

export function createIdpDelegate(tx: Tx): RecordDelegate {
  return {
    async findByBusinessKey(businessKey: string) {
      return tx.idpRsoRecord.findUnique({
        where: { businessKey },
        select: { contentHash: true },
      });
    },

    async insert(record: IncrementalRecord, importId: string) {
      const data = record.data as unknown as IdpNormalizedRecord;
      await tx.idpRsoRecord.create({
        data: {
          businessKey: record.businessKey,
          contentHash: record.contentHash,
          unit: data.unit,
          rsoNumero: data.rsoNumero,
          referenceDate: new Date(`${data.referenceDate}T12:00:00Z`),
          fileName: data.fileName,
          areas: toJsonValue(data.areas),
          discData: toJsonValue(data.discData),
          execucaoFases: toJsonValue(data.execucaoFases),
          raw: toJsonValue(data.raw),
          firstImportId: importId,
          lastImportId: importId,
        },
      });
    },

    async update(record: IncrementalRecord, importId: string) {
      const data = record.data as unknown as IdpNormalizedRecord;
      await tx.idpRsoRecord.update({
        where: { businessKey: record.businessKey },
        data: {
          contentHash: record.contentHash,
          unit: data.unit,
          rsoNumero: data.rsoNumero,
          referenceDate: new Date(`${data.referenceDate}T12:00:00Z`),
          fileName: data.fileName,
          areas: toJsonValue(data.areas),
          discData: toJsonValue(data.discData),
          execucaoFases: toJsonValue(data.execucaoFases),
          raw: toJsonValue(data.raw),
          lastImportId: importId,
          lastSeenAt: new Date(),
        },
      });
    },
  };
}

export async function loadIdpRecords(tx: Tx) {
  return tx.idpRsoRecord.findMany({
    orderBy: [{ referenceDate: "desc" }, { unit: "asc" }, { rsoNumero: "desc" }],
  });
}

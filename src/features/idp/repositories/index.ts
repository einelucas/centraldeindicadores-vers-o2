/** Repositório do IDP por RSO semanal. */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import type {
  IncrementalRecord,
  RecordDelegate,
} from "@/importers/shared/incremental-upsert";

import type { IdpNormalizedRecord } from "@/features/idp/types";

type Tx = Prisma.TransactionClient;

function toDate(value: string | null): Date | null {
  return value ? new Date(`${value}T12:00:00Z`) : null;
}

export function createIdpDelegate(tx: Tx): RecordDelegate {
  return {
    async findByBusinessKey(businessKey: string) {
      return tx.idpRsoRecord.findUnique({
        where: { businessKey },
        select: { contentHash: true },
      });
    },

    async insert(record: IncrementalRecord, importId: string) {
      const d = record.data as unknown as IdpNormalizedRecord;
      await tx.idpRsoRecord.create({
        data: {
          businessKey: record.businessKey,
          contentHash: record.contentHash,
          unit: d.unit,
          detectedUnit: d.detectedUnit,
          unitAdjusted: d.unitAdjusted,
          rsoNumero: d.rsoNumero!,
          detectedRsoNumero: d.detectedRsoNumero,
          rsoAdjusted: d.rsoAdjusted,
          referenceYear: d.referenceYear!,
          referenceMonth: d.referenceMonth!,
          detectedReferenceYear: d.detectedReferenceYear,
          detectedReferenceMonth: d.detectedReferenceMonth,
          referenceSource: d.referenceSource,
          referenceOriginalText: d.referenceOriginalText,
          referenceAdjusted: d.referenceAdjusted,
          periodStart: toDate(d.periodStart),
          periodEnd: toDate(d.periodEnd),
          emissionDate: toDate(d.emissionDate),
          fileName: d.fileName,
          areas: toJsonValue(d.areas),
          discData: toJsonValue(d.discData),
          execucaoFases: toJsonValue(d.execucaoFases),
          raw: toJsonValue(d.raw),
          firstImportId: importId,
          lastImportId: importId,
        },
      });
    },

    async update(record: IncrementalRecord, importId: string) {
      const d = record.data as unknown as IdpNormalizedRecord;
      await tx.idpRsoRecord.update({
        where: { businessKey: record.businessKey },
        data: {
          contentHash: record.contentHash,
          unit: d.unit,
          detectedUnit: d.detectedUnit,
          unitAdjusted: d.unitAdjusted,
          rsoNumero: d.rsoNumero!,
          detectedRsoNumero: d.detectedRsoNumero,
          rsoAdjusted: d.rsoAdjusted,
          referenceYear: d.referenceYear!,
          referenceMonth: d.referenceMonth!,
          detectedReferenceYear: d.detectedReferenceYear,
          detectedReferenceMonth: d.detectedReferenceMonth,
          referenceSource: d.referenceSource,
          referenceOriginalText: d.referenceOriginalText,
          referenceAdjusted: d.referenceAdjusted,
          periodStart: toDate(d.periodStart),
          periodEnd: toDate(d.periodEnd),
          emissionDate: toDate(d.emissionDate),
          fileName: d.fileName,
          areas: toJsonValue(d.areas),
          discData: toJsonValue(d.discData),
          execucaoFases: toJsonValue(d.execucaoFases),
          raw: toJsonValue(d.raw),
          lastImportId: importId,
          lastSeenAt: new Date(),
        },
      });
    },
  };
}

export async function loadIdpRecords(
  tx: Tx,
  filter?: { referenceYear?: number; referenceMonth?: number },
) {
  return tx.idpRsoRecord.findMany({
    where: {
      referenceYear: filter?.referenceYear,
      referenceMonth: filter?.referenceMonth,
    },
    orderBy: [
      { referenceYear: "asc" },
      { referenceMonth: "asc" },
      { unit: "asc" },
      { rsoNumero: "asc" },
    ],
  });
}

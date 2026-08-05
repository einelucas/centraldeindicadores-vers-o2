/** Serviço backend dos documentos RSO do IDP. */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import { idpRecordSchema, type IdpRecordInput } from "@/features/idp/schemas";
import { idpBusinessKey, idpContentHash } from "@/features/idp/utils/keys";
import { computeIdpResult } from "@/features/idp/calculations";
import { loadIdpExcludedDisciplines } from "@/features/idp/configuration";
import { loadIdpRecords } from "@/features/idp/repositories";
import { IDP_DEFAULT_TARGET, type IdpNormalizedRecord } from "@/features/idp/types";
import type { IncrementalRecord } from "@/importers/shared/incremental-upsert";

interface StoredIdpRow {
  id: string;
  businessKey: string;
  unit: string;
  rsoNumero: number | null;
  referenceDate: Date;
  fileName: string;
  areas: unknown;
  discData: unknown;
  execucaoFases: unknown;
  raw: unknown;
  updatedAt: Date;
}

function recordFromInput(input: IdpRecordInput): IdpNormalizedRecord {
  return {
    unit: input.unit,
    rsoNumero: input.rsoNumero,
    referenceDate: input.referenceDate,
    fileName: input.fileName,
    areas: input.areas,
    discData: input.discData,
    execucaoFases: input.execucaoFases,
    raw: input.raw,
  };
}

export function toIncrementalRecords(rawRecords: unknown[]): {
  records: IncrementalRecord[];
  rejected: number;
} {
  const records: IncrementalRecord[] = [];
  let rejected = 0;

  for (const raw of rawRecords) {
    const parsed = idpRecordSchema.safeParse(raw);
    if (!parsed.success) {
      rejected += 1;
      continue;
    }
    const record = recordFromInput(parsed.data);
    records.push({
      businessKey: idpBusinessKey(record),
      contentHash: idpContentHash(record),
      data: record as unknown as Record<string, unknown>,
    });
  }

  return { records, rejected };
}

export function storedIdpRowToRecord(row: StoredIdpRow): IdpNormalizedRecord {
  const parsed = idpRecordSchema.safeParse({
    unit: row.unit,
    rsoNumero: row.rsoNumero,
    referenceDate: row.referenceDate.toISOString().slice(0, 10),
    fileName: row.fileName,
    areas: row.areas,
    discData: row.discData,
    execucaoFases: row.execucaoFases,
    raw: row.raw,
  });

  if (!parsed.success) {
    throw new Error(`O RSO persistido para a unidade ${row.unit} possui dados inválidos.`);
  }

  return {
    id: row.id,
    businessKey: row.businessKey,
    updatedAt: row.updatedAt.toISOString(),
    ...recordFromInput(parsed.data),
  };
}

/** Recalcula o resultado técnico consolidado após cada importação. */
export async function recalcIdpIndicators(tx: Prisma.TransactionClient): Promise<void> {
  const [rows, excludedDisciplines] = await Promise.all([
    loadIdpRecords(tx),
    loadIdpExcludedDisciplines(tx),
  ]);
  const records = (rows as StoredIdpRow[]).map(storedIdpRowToRecord);
  const result = computeIdpResult(records, IDP_DEFAULT_TARGET, excludedDisciplines);

  await tx.indicatorResult.deleteMany({
    where: { module: "idp", indicator: "aderencia" },
  });

  if (!result.activeDocuments) return;

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const adherence = result.aderenciaGeral;

  await tx.indicatorResult.create({
    data: {
      module: "idp",
      indicator: "aderencia",
      unit: "__ALL__",
      year,
      month,
      value: adherence,
      target: IDP_DEFAULT_TARGET,
      adherence,
      status: adherence >= IDP_DEFAULT_TARGET ? "OK" : "ABAIXO",
      details: toJsonValue({
        source: "RSO",
        activeDocuments: result.activeDocuments,
        units: result.unitRows.length,
        disciplinesWithData: result.disciplineRows.filter((row) => row.aderencia !== null).length,
      }),
    },
  });
}

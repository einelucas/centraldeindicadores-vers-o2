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
  detectedUnit: string | null;
  unitAdjusted: boolean;
  rsoNumero: number;
  detectedRsoNumero: number | null;
  rsoAdjusted: boolean;
  referenceYear: number;
  referenceMonth: number;
  detectedReferenceYear: number | null;
  detectedReferenceMonth: number | null;
  referenceSource: string;
  referenceOriginalText: string | null;
  referenceAdjusted: boolean;
  periodStart: Date | null;
  periodEnd: Date | null;
  emissionDate: Date | null;
  fileName: string;
  areas: unknown;
  discData: unknown;
  execucaoFases: unknown;
  raw: unknown;
  updatedAt: Date;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}


function normalizeStoredExecutionPhases(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  return value.map((phase, index) => {
    if (!phase || typeof phase !== "object" || Array.isArray(phase)) return phase;

    const item = phase as Record<string, unknown>;
    const currentLabel =
      typeof item.label === "string" && item.label.trim() !== ""
        ? item.label.trim()
        : null;

    if (currentLabel) return { ...item, label: currentLabel };

    return {
      ...item,
      // Registros criados pela versão anterior do IDP não armazenavam o
      // rótulo da fase. Não inventamos "Fase 1/2/3" sem evidência no PDF:
      // usamos um rótulo neutro apenas para manter o histórico legível.
      label: value.length === 1 ? "Execução" : `Execução ${index + 1}`,
    };
  });
}

function normalizeStoredReferenceSource(
  value: string,
  referenceYear: number,
  referenceMonth: number,
): "PDF_MES_REF" | "MANUAL" {
  if (value === "MANUAL") return "MANUAL";
  if (value === "PDF_MES_REF") return "PDF_MES_REF";

  // Compatibilidade defensiva com registros de patches intermediários.
  // Como a linha já possui competência persistida, mantemos a origem como
  // leitura do PDF em vez de derrubar todo o painel por um enum antigo.
  if (Number.isInteger(referenceYear) && Number.isInteger(referenceMonth)) {
    return "PDF_MES_REF";
  }

  return "MANUAL";
}

function recordFromInput(input: IdpRecordInput): IdpNormalizedRecord {
  return {
    unit: input.unit,
    detectedUnit: input.detectedUnit,
    unitAdjusted: input.unitAdjusted,
    rsoNumero: input.rsoNumero,
    detectedRsoNumero: input.detectedRsoNumero,
    rsoAdjusted: input.rsoAdjusted,
    referenceYear: input.referenceYear,
    referenceMonth: input.referenceMonth,
    detectedReferenceYear: input.detectedReferenceYear,
    detectedReferenceMonth: input.detectedReferenceMonth,
    referenceSource: input.referenceSource,
    referenceOriginalText: input.referenceOriginalText,
    referenceAdjusted: input.referenceAdjusted,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    emissionDate: input.emissionDate,
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
    detectedUnit: row.detectedUnit,
    unitAdjusted: row.unitAdjusted,
    rsoNumero: row.rsoNumero,
    detectedRsoNumero: row.detectedRsoNumero,
    rsoAdjusted: row.rsoAdjusted,
    referenceYear: row.referenceYear,
    referenceMonth: row.referenceMonth,
    detectedReferenceYear: row.detectedReferenceYear,
    detectedReferenceMonth: row.detectedReferenceMonth,
    referenceSource: normalizeStoredReferenceSource(
      row.referenceSource,
      row.referenceYear,
      row.referenceMonth,
    ),
    referenceOriginalText: row.referenceOriginalText,
    referenceAdjusted: row.referenceAdjusted,
    periodStart: iso(row.periodStart),
    periodEnd: iso(row.periodEnd),
    emissionDate: iso(row.emissionDate),
    fileName: row.fileName,
    areas: row.areas,
    discData: row.discData,
    execucaoFases: normalizeStoredExecutionPhases(row.execucaoFases),
    raw: row.raw,
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "registro"}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `O RSO persistido ${row.rsoNumero} da unidade ${row.unit} possui dados inválidos: ${details}`,
    );
  }

  return {
    id: row.id,
    businessKey: row.businessKey,
    updatedAt: row.updatedAt.toISOString(),
    ...recordFromInput(parsed.data),
  };
}

/** Recalcula o resultado técnico usando a competência mais recente disponível. */
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

  const adherence = result.aderenciaGeral;
  await tx.indicatorResult.create({
    data: {
      module: "idp",
      indicator: "aderencia",
      unit: "__ALL__",
      year: result.selectedYear,
      month: result.selectedMonth,
      value: adherence,
      target: IDP_DEFAULT_TARGET,
      adherence,
      status: adherence >= IDP_DEFAULT_TARGET ? "OK" : "ABAIXO",
      details: toJsonValue({
        source: "RSO",
        competence: `${result.selectedYear}-${String(result.selectedMonth).padStart(2, "0")}`,
        activeDocuments: result.activeDocuments,
        documents: result.unitRows.map((row) => ({
          unit: row.unit,
          rsoNumero: row.rsoNumero,
          fileName: row.fileName,
        })),
      }),
    },
  });
}

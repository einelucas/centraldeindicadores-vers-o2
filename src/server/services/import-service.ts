/**
 * Serviço de importação genérico.
 * Orquestra ImportJob -> ImportBatch (idempotente) -> finalização.
 *
 * Cada lote roda em uma transação. Reenvio do mesmo (importJobId, batchNumber)
 * retorna o resultado já processado (idempotência garantida por índice único).
 */

import type { Prisma } from "@prisma/client";
import { toJsonValue } from "@/server/database/json";
import { prisma } from "@/server/database/prisma";
import {
  processIncrementalBatch,
  type IncrementalRecord,
  type RecordDelegate,
  type UpsertOutcome,
} from "@/importers/shared/incremental-upsert";
import { recordAudit } from "@/server/audit";

export interface StartImportInput {
  module: string;
  fileName: string;
  referenceYear?: number;
  referenceMonth?: number;
  totalFound: number;
  userId: string;
}

export async function startImportJob(input: StartImportInput) {
  const job = await prisma.importJob.create({
    data: {
      module: input.module,
      fileName: input.fileName.slice(0, 300), // sanitiza tamanho do nome exibido
      referenceYear: input.referenceYear,
      referenceMonth: input.referenceMonth,
      totalFound: input.totalFound,
      status: "PROCESSING",
      userId: input.userId,
    },
  });
  await recordAudit({
    userId: input.userId,
    action: "IMPORT_STARTED",
    entity: "ImportJob",
    entityId: job.id,
    metadata: { module: input.module, fileName: job.fileName },
  });
  return job;
}

type DelegateFactory = (tx: Prisma.TransactionClient) => RecordDelegate;

/**
 * Processa um lote de forma idempotente.
 * Se o lote já foi processado antes (mesmo importJobId+batchNumber), retorna
 * o resultado anterior sem reprocessar.
 */
export async function processBatch(params: {
  importJobId: string;
  batchNumber: number;
  records: IncrementalRecord[];
  delegateFactory: DelegateFactory;
}): Promise<UpsertOutcome & { alreadyProcessed: boolean }> {
  const { importJobId, batchNumber, records, delegateFactory } = params;

  // Idempotência: se já existe o registro do lote, devolve os números salvos.
  const existingBatch = await prisma.importBatch.findUnique({
    where: { importJobId_batchNumber: { importJobId, batchNumber } },
  });
  if (existingBatch) {
    return {
      inserted: existingBatch.totalInserted,
      ignored: existingBatch.totalIgnored,
      updated: existingBatch.totalUpdated,
      rejected: existingBatch.totalRejected,
      errors: [],
      alreadyProcessed: true,
    };
  }

  /**
   * Não mantemos os 100/500 registros dentro de uma única transação remota.
   * O motor incremental faz consultas por registro e, no Neon, uma transação
   * grande pode ultrapassar o timeout. Cada sublote é atômico e curto; como as
   * operações usam businessKey único, um eventual reenvio continua idempotente.
   */
  const SERVER_TRANSACTION_CHUNK_SIZE = 50;
  const outcome: UpsertOutcome = {
    inserted: 0,
    ignored: 0,
    updated: 0,
    rejected: 0,
    errors: [],
  };

  for (let offset = 0; offset < records.length; offset += SERVER_TRANSACTION_CHUNK_SIZE) {
    const transactionRecords = records.slice(
      offset,
      offset + SERVER_TRANSACTION_CHUNK_SIZE,
    );

    const partial = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const delegate = delegateFactory(tx);
        return processIncrementalBatch(
          transactionRecords,
          delegate,
          importJobId,
        );
      },
      {
        maxWait: 15000,
        timeout: 60000,
      },
    );

    outcome.inserted += partial.inserted;
    outcome.ignored += partial.ignored;
    outcome.updated += partial.updated;
    outcome.rejected += partial.rejected;
    outcome.errors.push(...partial.errors);
  }

  try {
    // A contabilização final é uma transação curta, separada do processamento
    // linha a linha. Assim ela não herda uma transação quase expirada.
    await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.importBatch.create({
          data: {
            importJobId,
            batchNumber,
            totalReceived: records.length,
            totalInserted: outcome.inserted,
            totalIgnored: outcome.ignored,
            totalUpdated: outcome.updated,
            totalRejected: outcome.rejected,
          },
        });

        if (outcome.errors.length) {
          await tx.importError.createMany({
            data: outcome.errors.map((error) => ({
              importJobId,
              batchNumber,
              field: "businessKey",
              message: error.message,
              rawData: toJsonValue({ businessKey: error.businessKey }),
            })),
          });
        }

        await tx.importJob.update({
          where: { id: importJobId },
          data: {
            totalInserted: { increment: outcome.inserted },
            totalIgnored: { increment: outcome.ignored },
            totalUpdated: { increment: outcome.updated },
            totalRejected: { increment: outcome.rejected },
          },
        });
      },
      {
        maxWait: 15000,
        timeout: 30000,
      },
    );
  } catch (error) {
    // Se duas requisições do mesmo lote correrem ao mesmo tempo, o índice único
    // pode fazer uma delas perder a corrida. Nesse caso devolvemos o lote salvo.
    const completedBatch = await prisma.importBatch.findUnique({
      where: { importJobId_batchNumber: { importJobId, batchNumber } },
    });
    if (completedBatch) {
      return {
        inserted: completedBatch.totalInserted,
        ignored: completedBatch.totalIgnored,
        updated: completedBatch.totalUpdated,
        rejected: completedBatch.totalRejected,
        errors: [],
        alreadyProcessed: true,
      };
    }
    throw error;
  }

  return { ...outcome, alreadyProcessed: false };
}

/**
 * Finaliza a importação: define status final, recalcula indicadores (callback)
 * e registra auditoria — tudo dentro de transação.
 */
export async function finalizeImportJob(params: {
  importJobId: string;
  userId: string;
  recalcIndicators?: (tx: Prisma.TransactionClient) => Promise<void>;
}) {
  const { importJobId, userId, recalcIndicators } = params;

  const finalized = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const job = await tx.importJob.findUniqueOrThrow({
      where: { id: importJobId },
    });
    if (recalcIndicators) await recalcIndicators(tx);

    const status =
      job.totalRejected > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";

    return tx.importJob.update({
      where: { id: importJobId },
      data: { status, completedAt: new Date() },
    });
  },
  {
    // A finalização recalcula indicadores; em banco remoto pode demorar.
    maxWait: 15000,
    timeout: 120000,
  });

  await recordAudit({
    userId,
    action: "IMPORT_COMPLETED",
    entity: "ImportJob",
    entityId: importJobId,
    metadata: {
      status: finalized.status,
      inserted: finalized.totalInserted,
      updated: finalized.totalUpdated,
      ignored: finalized.totalIgnored,
      rejected: finalized.totalRejected,
    },
  });

  return finalized;
}

/** Marca job como falho, registrando a mensagem no servidor (não ao usuário). */
export async function failImportJob(importJobId: string, message: string) {
  await prisma.importJob.update({
    where: { id: importJobId },
    data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
  });
}

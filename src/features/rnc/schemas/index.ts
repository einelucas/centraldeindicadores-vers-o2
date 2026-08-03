/**
 * Schemas Zod do RNC. Pré-validação no frontend e revalidação no backend.
 */

import { z } from "zod";

export const rncRecordSchema = z.object({
  statusRnc: z.string().default(""),
  unidade: z.string().default(""),
  dataCriacao: z.string().datetime({ offset: true }).or(z.string().min(1)),
  dataSolucao: z.string().nullable().default(null),
  tempoTratativa: z.number().nullable().default(null),
  ofensor: z.string().default("N/A"),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  raw: z.record(z.unknown()),
});

export type RncRecordInput = z.infer<typeof rncRecordSchema>;

export const rncBatchSchema = z.object({
  batchNumber: z.number().int().min(1),
  records: z
    .array(rncRecordSchema)
    .max(5000, "Lote excede o limite de registros"),
});

export type RncBatchInput = z.infer<typeof rncBatchSchema>;

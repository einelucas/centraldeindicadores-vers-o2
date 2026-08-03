/**
 * Schemas Zod do 5S. Pré-validação no frontend e revalidação no backend.
 */

import { z } from "zod";

export const fiveSAreaSchema = z.object({
  divisao: z.string().nullable().default(null),
  area: z.string().min(1),
  meta: z.number(),
  nota: z.number(),
});

export const fiveSRecordSchema = z.object({
  unit: z.string().min(1),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  areas: z.array(fiveSAreaSchema).min(1),
  raw: z.record(z.unknown()),
});

export type FiveSRecordInput = z.infer<typeof fiveSRecordSchema>;

export const fiveSBatchSchema = z.object({
  batchNumber: z.number().int().min(1),
  records: z.array(fiveSRecordSchema).max(5000),
});

export type FiveSBatchInput = z.infer<typeof fiveSBatchSchema>;

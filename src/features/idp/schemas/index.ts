/**
 * Schemas Zod do IDP. Pré-validação no frontend e revalidação no backend.
 */

import { z } from "zod";

/** Registro IDP normalizado que trafega frontend -> API como JSON. */
export const idpRecordSchema = z.object({
  unit: z.string().min(1, "unidade é obrigatória"),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  disciplina: z.string().min(1, "disciplina é obrigatória"),
  custoLinhaBase: z.number(),
  custoReal: z.number(),
  raw: z.record(z.unknown()),
});

export type IdpRecordInput = z.infer<typeof idpRecordSchema>;

/** Payload de um lote de importação de IDP. */
export const idpBatchSchema = z.object({
  batchNumber: z.number().int().min(1),
  records: z
    .array(idpRecordSchema)
    .max(5000, "Lote excede o limite de registros"),
});

export type IdpBatchInput = z.infer<typeof idpBatchSchema>;

/** Schemas Zod dos documentos RSO do IDP. */

import { z } from "zod";

const phaseSchema = z.object({
  prevAcum: z.number().finite(),
  realAcum: z.number().finite(),
});

const areaValueSchema = phaseSchema.extend({ area: z.string().min(1) });

const referenceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "competência deve estar no formato YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "competência inválida");

export const idpRecordSchema = z.object({
  unit: z.string().trim().min(1, "unidade é obrigatória"),
  rsoNumero: z.number().int().nonnegative().nullable(),
  referenceDate: referenceDateSchema,
  fileName: z.string().trim().min(1, "nome do arquivo é obrigatório"),
  areas: z.array(z.string()),
  discData: z.record(z.array(areaValueSchema)),
  execucaoFases: z.array(phaseSchema),
  raw: z.record(z.unknown()),
});

export type IdpRecordInput = z.infer<typeof idpRecordSchema>;

export const idpBatchSchema = z.object({
  batchNumber: z.number().int().min(1),
  records: z.array(idpRecordSchema).max(5000, "Lote excede o limite de registros"),
});

export type IdpBatchInput = z.infer<typeof idpBatchSchema>;

/** Schemas Zod do IDP por RSO. */

import { z } from "zod";

const isoDateNullable = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const areaValueSchema = z.object({
  area: z.string().min(1),
  prevAcum: z.number().finite(),
  realAcum: z.number().finite(),
});

const phaseSchema = z.object({
  // Compatibilidade com RSOs persistidos pela primeira versão do patch,
  // quando o label da fase ainda não era salvo no JSON. O serviço backend
  // acrescenta rótulos indexados antes da validação; este default evita que
  // qualquer outra leitura legada derrube o módulo.
  label: z.string().trim().min(1).optional().default("Execução"),
  prevAcum: z.number().finite(),
  realAcum: z.number().finite(),
});

/** Registro semanal normalizado que trafega frontend -> API. */
export const idpRecordSchema = z.object({
  unit: z.string().trim().min(1, "unidade é obrigatória"),
  detectedUnit: z.string().trim().min(1).nullable(),
  unitAdjusted: z.boolean(),

  rsoNumero: z.number().int().positive("número do RSO é obrigatório"),
  detectedRsoNumero: z.number().int().positive().nullable(),
  rsoAdjusted: z.boolean(),

  referenceYear: z.number().int().min(2000).max(2200),
  referenceMonth: z.number().int().min(1).max(12),
  detectedReferenceYear: z.number().int().min(2000).max(2200).nullable(),
  detectedReferenceMonth: z.number().int().min(1).max(12).nullable(),
  referenceSource: z.enum(["PDF_MES_REF", "MANUAL"]),
  referenceOriginalText: z.string().max(200).nullable(),
  referenceAdjusted: z.boolean(),

  periodStart: isoDateNullable,
  periodEnd: isoDateNullable,
  emissionDate: isoDateNullable,

  fileName: z.string().min(1).max(300),
  areas: z.array(z.string()),
  discData: z.record(z.array(areaValueSchema)),
  execucaoFases: z.array(phaseSchema),
  raw: z.record(z.unknown()),
});

export type IdpRecordInput = z.infer<typeof idpRecordSchema>;

export const idpBatchSchema = z.object({
  batchNumber: z.number().int().min(1),
  records: z.array(idpRecordSchema).max(500, "Lote excede o limite de RSOs"),
});

export type IdpBatchInput = z.infer<typeof idpBatchSchema>;

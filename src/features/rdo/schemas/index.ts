/**
 * Schemas Zod do RDO. Usados no frontend (pré-validação) e revalidados
 * no backend, conforme a arquitetura exigida (Zod duas vezes).
 */

import { z } from "zod";

/** Registro RDO já normalizado que trafega frontend -> API como JSON. */
export const rdoRecordSchema = z.object({
  dataReferencia: z.string().datetime({ offset: true }).or(z.string().min(1)),
  empresaNome: z.string().min(1, "empresa_nome é obrigatório"),
  statusDescricao: z.string().default(""),
  relatorioId: z.string().nullable().default(null),
  grupo: z.string().nullable().default(null),
  disciplina: z.string().nullable().default(null),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  raw: z.record(z.unknown()),
});

export type RdoRecordInput = z.infer<typeof rdoRecordSchema>;

/** Payload de um lote de importação de RDO. */
export const rdoBatchSchema = z.object({
  batchNumber: z.number().int().min(1),
  records: z.array(rdoRecordSchema).max(5000, "Lote excede o limite de registros"),
});

export type RdoBatchInput = z.infer<typeof rdoBatchSchema>;

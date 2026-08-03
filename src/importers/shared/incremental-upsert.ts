/**
 * Motor de importação incremental (insert / ignore / update).
 *
 * Regra de negócio central (do enunciado, reforçando o comportamento do HTML):
 *   - Registro não existe               -> inserir
 *   - Registro existe e é idêntico       -> ignorar (contentHash igual)
 *   - Registro existe e algum campo mudou -> atualizar SOMENTE aquele registro
 *
 * NÃO apaga o restante do mês. A ausência de um registro numa nova importação
 * não implica remoção.
 *
 * A integridade é garantida no banco por índice único em businessKey; aqui
 * usamos transações Prisma. Cada delegate expõe findUnique/create/update.
 */

export interface IncrementalRecord {
  businessKey: string;
  contentHash: string;
  data: Record<string, unknown>;
}

export interface UpsertOutcome {
  inserted: number;
  ignored: number;
  updated: number;
  rejected: number;
  errors: Array<{ businessKey: string; message: string }>;
}

/**
 * Delegate mínimo que um repositório de módulo precisa fornecer.
 * Mantém o motor desacoplado do Prisma para permitir testes com mocks.
 */
export interface RecordDelegate {
  findByBusinessKey(
    businessKey: string,
  ): Promise<{ contentHash: string } | null>;
  insert(record: IncrementalRecord, importId: string): Promise<void>;
  update(record: IncrementalRecord, importId: string): Promise<void>;
}

/**
 * Processa um lote de registros de forma incremental.
 * Deve ser chamado dentro de uma transação pelo serviço do módulo.
 */
export async function processIncrementalBatch(
  records: readonly IncrementalRecord[],
  delegate: RecordDelegate,
  importId: string,
): Promise<UpsertOutcome> {
  const outcome: UpsertOutcome = {
    inserted: 0,
    ignored: 0,
    updated: 0,
    rejected: 0,
    errors: [],
  };

  for (const record of records) {
    try {
      const existing = await delegate.findByBusinessKey(record.businessKey);
      if (!existing) {
        await delegate.insert(record, importId);
        outcome.inserted++;
      } else if (existing.contentHash === record.contentHash) {
        outcome.ignored++;
      } else {
        await delegate.update(record, importId);
        outcome.updated++;
      }
    } catch (err) {
      outcome.rejected++;
      outcome.errors.push({
        businessKey: record.businessKey,
        message: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  }

  return outcome;
}

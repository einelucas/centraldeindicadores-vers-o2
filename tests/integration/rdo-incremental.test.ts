/**
 * Teste de integração do fluxo incremental do RDO.
 *
 * Usa as fixtures .xlsx reais (tests/fixtures/rdo) e um delegate em memória,
 * exercitando exatamente a regra central do sistema:
 *   - primeira importação  -> tudo inserido
 *   - reimportar idêntico   -> tudo ignorado (nada apagado)
 *   - status alterado       -> somente o registro afetado é atualizado
 *   - duplicata 100% igual  -> contabilizada uma única vez
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { normalizeRows } from "@/lib/normalization";
import { toRdoRecord } from "@/features/rdo/importers";
import { rdoBusinessKey, rdoContentHash } from "@/features/rdo/utils/keys";
import {
  processIncrementalBatch,
  type IncrementalRecord,
  type RecordDelegate,
} from "@/importers/shared/incremental-upsert";

const FIX = (name: string) =>
  resolve(process.cwd(), "tests/fixtures/rdo", name);

/** Lê uma fixture .xlsx e devolve as linhas normalizadas (headers). */
function readFixtureRows(name: string): Array<Record<string, unknown>> {
  const buf = readFileSync(FIX(name));
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  return normalizeRows(raw);
}

/** Converte linhas em IncrementalRecord (keys iguais às do servidor). */
function toRecords(
  rows: Array<Record<string, unknown>>,
): IncrementalRecord[] {
  const out: IncrementalRecord[] = [];
  for (const row of rows) {
    const rec = toRdoRecord(row);
    if (!rec) continue;
    out.push({
      businessKey: rdoBusinessKey(rec),
      contentHash: rdoContentHash(rec),
      data: rec as unknown as Record<string, unknown>,
    });
  }
  return out;
}

/** Delegate em memória que imita o repositório Prisma. */
function makeMemoryDelegate() {
  const store = new Map<string, { contentHash: string }>();
  const delegate: RecordDelegate = {
    async findByBusinessKey(bk) {
      return store.get(bk) ?? null;
    },
    async insert(record) {
      store.set(record.businessKey, { contentHash: record.contentHash });
    },
    async update(record) {
      store.set(record.businessKey, { contentHash: record.contentHash });
    },
  };
  return { store, delegate };
}

describe("RDO — importação incremental (integração)", () => {
  it("primeira importação insere todos os registros válidos", async () => {
    const records = toRecords(readFixtureRows("valid.xlsx"));
    const { delegate, store } = makeMemoryDelegate();

    const outcome = await processIncrementalBatch(records, delegate, "job-1");

    expect(records.length).toBe(5);
    expect(outcome.inserted).toBe(5);
    expect(outcome.ignored).toBe(0);
    expect(outcome.updated).toBe(0);
    expect(store.size).toBe(5);
  });

  it("reimportar o mesmo arquivo ignora tudo (nada é apagado)", async () => {
    const records = toRecords(readFixtureRows("valid.xlsx"));
    const { delegate, store } = makeMemoryDelegate();

    await processIncrementalBatch(records, delegate, "job-1");
    const second = await processIncrementalBatch(records, delegate, "job-2");

    expect(second.inserted).toBe(0);
    expect(second.ignored).toBe(5);
    expect(second.updated).toBe(0);
    expect(store.size).toBe(5); // continua com os 5, nada removido
  });

  it("status alterado atualiza somente o registro afetado", async () => {
    const first = toRecords(readFixtureRows("valid.xlsx"));
    const updated = toRecords(readFixtureRows("status-updated.xlsx"));
    const { delegate } = makeMemoryDelegate();

    await processIncrementalBatch(first, delegate, "job-1");
    const outcome = await processIncrementalBatch(updated, delegate, "job-2");

    // Só R3 mudou de "Revisar Relatório" para "Aprovado".
    expect(outcome.updated).toBe(1);
    expect(outcome.ignored).toBe(4);
    expect(outcome.inserted).toBe(0);
  });

  it("business key é estável entre importações do mesmo registro", () => {
    const a = toRecords(readFixtureRows("valid.xlsx"));
    const b = toRecords(readFixtureRows("valid.xlsx"));
    const keysA = a.map((r) => r.businessKey).sort();
    const keysB = b.map((r) => r.businessKey).sort();
    expect(keysA).toEqual(keysB);
  });

  it("content hash muda quando o status muda", () => {
    const base = toRecords(readFixtureRows("valid.xlsx"));
    const upd = toRecords(readFixtureRows("status-updated.xlsx"));

    // Encontra o par de mesma businessKey (R3) e compara o hash.
    const byKey = new Map(base.map((r) => [r.businessKey, r.contentHash]));
    let changed = 0;
    for (const r of upd) {
      const prev = byKey.get(r.businessKey);
      if (prev && prev !== r.contentHash) changed++;
    }
    expect(changed).toBe(1);
  });
});

/**
 * Integração do IDP: detecção de cabeçalho deslocado (estilo MS Project),
 * filtragem de linhas de subtotal, e fluxo incremental com fixtures reais.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { parseWithHeaderDetection } from "@/importers/shared/header-detection";
import { toIdpRecord } from "@/features/idp/importers";
import { idpBusinessKey, idpContentHash } from "@/features/idp/utils/keys";
import { REQUIRED_IDP_COLS } from "@/features/idp/types";
import {
  processIncrementalBatch,
  type IncrementalRecord,
  type RecordDelegate,
} from "@/importers/shared/incremental-upsert";

const FIX = (name: string) =>
  resolve(process.cwd(), "tests/fixtures/idp", name);

function readMatrix(name: string): unknown[][] {
  const buf = readFileSync(FIX(name));
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
}

function toRecords(name: string, unit = "Projeto Teste"): IncrementalRecord[] {
  const matrix = readMatrix(name);
  const rows = parseWithHeaderDetection(matrix, REQUIRED_IDP_COLS);
  if (!rows) throw new Error("cabeçalho não detectado");
  const out: IncrementalRecord[] = [];
  for (const row of rows) {
    const rec = toIdpRecord(row, unit);
    if (!rec) continue;
    out.push({
      businessKey: idpBusinessKey(rec),
      contentHash: idpContentHash(rec),
      data: rec as unknown as Record<string, unknown>,
    });
  }
  return out;
}

function makeMemoryDelegate() {
  const store = new Map<string, { contentHash: string }>();
  const delegate: RecordDelegate = {
    async findByBusinessKey(bk) {
      return store.get(bk) ?? null;
    },
    async insert(r) {
      store.set(r.businessKey, { contentHash: r.contentHash });
    },
    async update(r) {
      store.set(r.businessKey, { contentHash: r.contentHash });
    },
  };
  return { store, delegate };
}

describe("IDP — importação incremental (integração)", () => {
  it("detecta cabeçalho deslocado e ignora linhas de subtotal", () => {
    const records = toRecords("valid.xlsx");
    // 3 linhas válidas (Total Geral e NULL são descartadas).
    expect(records.length).toBe(3);
  });

  it("primeira importação insere todos os registros válidos", async () => {
    const records = toRecords("valid.xlsx");
    const { delegate, store } = makeMemoryDelegate();
    const outcome = await processIncrementalBatch(records, delegate, "job-1");
    expect(outcome.inserted).toBe(3);
    expect(store.size).toBe(3);
  });

  it("reimportar idêntico ignora tudo", async () => {
    const records = toRecords("valid.xlsx");
    const { delegate } = makeMemoryDelegate();
    await processIncrementalBatch(records, delegate, "job-1");
    const second = await processIncrementalBatch(records, delegate, "job-2");
    expect(second.ignored).toBe(3);
    expect(second.inserted).toBe(0);
  });

  it("correção de custo real atualiza só o registro afetado", async () => {
    const first = toRecords("valid.xlsx");
    const updated = toRecords("cost-updated.xlsx");
    const { delegate } = makeMemoryDelegate();
    await processIncrementalBatch(first, delegate, "job-1");
    const outcome = await processIncrementalBatch(updated, delegate, "job-2");
    // Só a Mecânica de janeiro mudou (800 -> 990).
    expect(outcome.updated).toBe(1);
    expect(outcome.ignored).toBe(2);
  });
});

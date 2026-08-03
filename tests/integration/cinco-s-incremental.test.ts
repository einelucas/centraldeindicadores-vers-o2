/**
 * Integração do 5S: parsing por posição (Meta + data), cada aba = unidade,
 * exclusão de SP do GERAL e fluxo incremental (correção de nota atualiza só a
 * unidade afetada).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { parseFsWorkbookMatrix } from "@/features/cinco-s/importers";
import { computeFiveSResult } from "@/features/cinco-s/calculations";
import {
  fiveSBusinessKey,
  fiveSContentHash,
} from "@/features/cinco-s/utils/keys";
import {
  processIncrementalBatch,
  type IncrementalRecord,
  type RecordDelegate,
} from "@/importers/shared/incremental-upsert";
import type { FiveSNormalizedRecord } from "@/features/cinco-s/types";

const FIX = (name: string) =>
  resolve(process.cwd(), "tests/fixtures/cinco-s", name);

function readRecords(name: string): FiveSNormalizedRecord[] {
  const buf = readFileSync(FIX(name));
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const records: FiveSNormalizedRecord[] = [];
  for (const sheetName of wb.SheetNames) {
    const parsed = parseFsWorkbookMatrix(wb.Sheets[sheetName]!);
    if (!parsed) continue;
    records.push({
      unit: sheetName,
      year: parsed.auditDate.getFullYear(),
      month: parsed.auditDate.getMonth() + 1,
      areas: parsed.areas,
      raw: { sheet: sheetName },
    });
  }
  return records;
}

function toIncremental(records: FiveSNormalizedRecord[]): IncrementalRecord[] {
  return records.map((r) => ({
    businessKey: fiveSBusinessKey(r),
    contentHash: fiveSContentHash(r),
    data: r as unknown as Record<string, unknown>,
  }));
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

describe("5S — integração", () => {
  it("parseia cada aba como unidade e extrai áreas", () => {
    const records = readRecords("valid.xlsx");
    expect(records.length).toBe(3); // UNIDADE A, UNIDADE B, SP
    const a = records.find((r) => r.unit === "UNIDADE A")!;
    expect(a.areas.length).toBe(2);
    expect(a.month).toBe(1); // jan
  });

  it("GERAL exclui SP e avalia a meta", () => {
    const records = readRecords("valid.xlsx");
    const result = computeFiveSResult(records, ["SP"], 0.95);
    // UNIDADE A = (0.98+0.96)/2 = 0.97; UNIDADE B = (0.80+0.90)/2 = 0.85.
    // GERAL (sem SP) = (0.97+0.85)/2 = 0.91.
    expect(result.geral).toBeCloseTo(0.91);
    expect(result.passaMeta).toBe(false);
  });

  it("primeira importação insere; reimportar ignora", async () => {
    const recs = toIncremental(readRecords("valid.xlsx"));
    const { delegate } = makeMemoryDelegate();
    const first = await processIncrementalBatch(recs, delegate, "job-1");
    expect(first.inserted).toBe(3);
    const second = await processIncrementalBatch(recs, delegate, "job-2");
    expect(second.ignored).toBe(3);
  });

  it("correção de nota atualiza só a unidade afetada", async () => {
    const first = toIncremental(readRecords("valid.xlsx"));
    const updated = toIncremental(readRecords("updated.xlsx"));
    const { delegate } = makeMemoryDelegate();
    await processIncrementalBatch(first, delegate, "job-1");
    const outcome = await processIncrementalBatch(updated, delegate, "job-2");
    // Só UNIDADE B mudou (Expedição 80 -> 95).
    expect(outcome.updated).toBe(1);
    expect(outcome.ignored).toBe(2);
  });
});

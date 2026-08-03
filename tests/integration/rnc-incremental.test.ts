/**
 * Integração do RNC: leitura de fixture real e fluxo incremental
 * (retratativa que reduz o tempo atualiza só o chamado afetado).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { normalizeRows } from "@/lib/normalization";
import { toRncRecord, dedupeRncRows } from "@/features/rnc/importers";
import { computeRncResult } from "@/features/rnc/calculations";
import { rncBusinessKey, rncContentHash } from "@/features/rnc/utils/keys";
import {
  processIncrementalBatch,
  type IncrementalRecord,
  type RecordDelegate,
} from "@/importers/shared/incremental-upsert";
import type { RncNormalizedRecord } from "@/features/rnc/types";

const FIX = (name: string) => resolve(process.cwd(), "tests/fixtures/rnc", name);

function readRecords(name: string): RncNormalizedRecord[] {
  const buf = readFileSync(FIX(name));
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]!]!;
  const raw = normalizeRows(
    XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }),
  );
  const { rows } = dedupeRncRows(raw);
  return rows
    .map(toRncRecord)
    .filter((r): r is RncNormalizedRecord => r !== null);
}

function toIncremental(records: RncNormalizedRecord[]): IncrementalRecord[] {
  return records.map((r) => ({
    businessKey: rncBusinessKey(r),
    contentHash: rncContentHash(r),
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

describe("RNC — integração", () => {
  it("calcula dias médios e situação a partir da fixture", () => {
    const records = readRecords("valid.xlsx");
    const result = computeRncResult(records, 15);
    expect(result.totalCriadas).toBe(3);
    const jan = result.months.find((m) => m.month === 0)!; // janeiro (0-based)
    expect(jan.chamados).toBe(3);
    expect(jan.solucionados).toBe(2);
    // (7 + 22) / 2 = 14,5 -> dentro da meta de 15
    expect(jan.diasMedios).toBeCloseTo(14.5);
    expect(jan.dentroMeta).toBe(true);
  });

  it("primeira importação insere; reimportar ignora", async () => {
    const recs = toIncremental(readRecords("valid.xlsx"));
    const { delegate } = makeMemoryDelegate();
    const first = await processIncrementalBatch(recs, delegate, "job-1");
    expect(first.inserted).toBe(3);
    const second = await processIncrementalBatch(recs, delegate, "job-2");
    expect(second.ignored).toBe(3);
  });

  it("retratativa (tempo alterado) atualiza só o chamado afetado", async () => {
    const first = toIncremental(readRecords("valid.xlsx"));
    const updated = toIncremental(readRecords("updated.xlsx"));
    const { delegate } = makeMemoryDelegate();
    await processIncrementalBatch(first, delegate, "job-1");
    const outcome = await processIncrementalBatch(updated, delegate, "job-2");
    // Só o C2 mudou (tempo 22 -> 10, data de solução diferente).
    expect(outcome.updated).toBe(1);
    expect(outcome.ignored).toBe(2);
  });
});

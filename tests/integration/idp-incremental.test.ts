import { describe, expect, it } from "vitest";
import { idpBusinessKey, idpContentHash } from "@/features/idp/utils/keys";
import type { IdpNormalizedRecord } from "@/features/idp/types";
import {
  processIncrementalBatch,
  type RecordDelegate,
} from "@/importers/shared/incremental-upsert";

function record(overrides: Partial<IdpNormalizedRecord> = {}): IdpNormalizedRecord {
  return {
    unit: "Nova Mutum",
    detectedUnit: "Nova Mutum",
    unitAdjusted: false,
    rsoNumero: 34,
    detectedRsoNumero: 34,
    rsoAdjusted: false,
    referenceYear: 2026,
    referenceMonth: 6,
    detectedReferenceYear: 2026,
    detectedReferenceMonth: 6,
    referenceSource: "PDF_MES_REF",
    referenceOriginalText: "Mês ref.: 01/06/2026",
    referenceAdjusted: false,
    periodStart: "2026-06-24",
    periodEnd: "2026-07-01",
    emissionDate: "2026-07-06",
    fileName: "rso34.pdf",
    areas: [],
    discData: {},
    execucaoFases: [{ label: "Fase 1", prevAcum: 53.08, realAcum: 54.79 }],
    raw: {},
    ...overrides,
  };
}

function incremental(r: IdpNormalizedRecord) {
  return {
    businessKey: idpBusinessKey(r),
    contentHash: idpContentHash(r),
    data: r as unknown as Record<string, unknown>,
  };
}

function memoryDelegate() {
  const store = new Map<string, { contentHash: string }>();
  const delegate: RecordDelegate = {
    async findByBusinessKey(key) { return store.get(key) ?? null; },
    async insert(item) { store.set(item.businessKey, { contentHash: item.contentHash }); },
    async update(item) { store.set(item.businessKey, { contentHash: item.contentHash }); },
  };
  return { store, delegate };
}

describe("IDP RSO — incremental", () => {
  it("o mesmo número de RSO da mesma unidade é a mesma versão lógica", () => {
    expect(idpBusinessKey(record({ referenceMonth: 6 }))).toBe(
      idpBusinessKey(record({ referenceMonth: 7, referenceSource: "MANUAL", referenceAdjusted: true })),
    );
  });

  it("uma correção do mesmo RSO atualiza em vez de criar outra versão", async () => {
    const first = incremental(record());
    const corrected = incremental(record({ referenceMonth: 7, referenceSource: "MANUAL", referenceAdjusted: true }));
    const { delegate, store } = memoryDelegate();
    const a = await processIncrementalBatch([first], delegate, "job-1");
    const b = await processIncrementalBatch([corrected], delegate, "job-2");
    expect(a.inserted).toBe(1);
    expect(b.updated).toBe(1);
    expect(store.size).toBe(1);
  });
});

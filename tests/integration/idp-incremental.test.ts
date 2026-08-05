import { describe, expect, it } from "vitest";
import { idpBusinessKey, idpContentHash } from "@/features/idp/utils/keys";
import type { IdpNormalizedRecord } from "@/features/idp/types";
import {
  processIncrementalBatch,
  type IncrementalRecord,
  type RecordDelegate,
} from "@/importers/shared/incremental-upsert";

function rso(realAcum: number): IdpNormalizedRecord {
  return {
    unit: "Unidade Teste",
    rsoNumero: 15,
    referenceDate: "2026-08-05",
    fileName: "rso-15.pdf",
    areas: ["Área 1"],
    discData: {
      "01 - Civil": [{ area: "Área 1", prevAcum: 100, realAcum }],
    },
    execucaoFases: [{ prevAcum: 100, realAcum }],
    raw: {},
  };
}

function incremental(record: IdpNormalizedRecord): IncrementalRecord {
  return {
    businessKey: idpBusinessKey(record),
    contentHash: idpContentHash(record),
    data: record as unknown as Record<string, unknown>,
  };
}

function makeMemoryDelegate() {
  const store = new Map<string, { contentHash: string }>();
  const delegate: RecordDelegate = {
    async findByBusinessKey(businessKey) {
      return store.get(businessKey) ?? null;
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

describe("IDP RSO — importação incremental", () => {
  it("usa unidade + número do RSO como identidade lógica", () => {
    expect(idpBusinessKey(rso(90))).toBe(idpBusinessKey(rso(95)));
    expect(idpContentHash(rso(90))).not.toBe(idpContentHash(rso(95)));
  });


  it("mantém o hash estável mesmo quando as chaves do JSON mudam de ordem", () => {
    const first = rso(90);
    const second: IdpNormalizedRecord = {
      ...first,
      discData: {
        "04 - Elétrica": [],
        "01 - Civil": first.discData["01 - Civil"] ?? [],
      },
    };
    const firstWithExtraKey: IdpNormalizedRecord = {
      ...first,
      discData: {
        "01 - Civil": first.discData["01 - Civil"] ?? [],
        "04 - Elétrica": [],
      },
    };

    expect(idpContentHash(firstWithExtraKey)).toBe(idpContentHash(second));
  });

  it("insere, ignora reimportação idêntica e atualiza conteúdo corrigido", async () => {
    const { delegate, store } = makeMemoryDelegate();
    const first = await processIncrementalBatch([incremental(rso(90))], delegate, "job-1");
    const identical = await processIncrementalBatch([incremental(rso(90))], delegate, "job-2");
    const corrected = await processIncrementalBatch([incremental(rso(95))], delegate, "job-3");

    expect(first.inserted).toBe(1);
    expect(identical.ignored).toBe(1);
    expect(corrected.updated).toBe(1);
    expect(store.size).toBe(1);
  });
});

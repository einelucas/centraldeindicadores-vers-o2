/** Registro dos módulos atendidos pelo motor de importação incremental. */

import type { Prisma } from "@prisma/client";
import type { ZodType } from "zod";
import type {
  IncrementalRecord,
  RecordDelegate,
} from "@/importers/shared/incremental-upsert";

import { rdoBatchSchema } from "@/features/rdo/schemas";
import { createRdoDelegate } from "@/features/rdo/repositories";
import {
  toIncrementalRecords as rdoToIncremental,
  recalcRdoIndicators,
} from "@/features/rdo/services";

import { idpBatchSchema } from "@/features/idp/schemas";
import { createIdpDelegate } from "@/features/idp/repositories";
import {
  toIncrementalRecords as idpToIncremental,
  recalcIdpIndicators,
} from "@/features/idp/services";

import { rncBatchSchema } from "@/features/rnc/schemas";
import { createRncDelegate } from "@/features/rnc/repositories";
import {
  toIncrementalRecords as rncToIncremental,
  recalcRncIndicators,
} from "@/features/rnc/services";

import { fiveSBatchSchema } from "@/features/cinco-s/schemas";
import { createFiveSDelegate } from "@/features/cinco-s/repositories";
import {
  toIncrementalRecords as fiveSToIncremental,
  recalcFiveSIndicators,
} from "@/features/cinco-s/services";

export interface ModuleDefinition {
  batchSchema: ZodType<{ batchNumber: number; records: unknown[] }>;
  toIncrementalRecords: (records: unknown[]) => {
    records: IncrementalRecord[];
    rejected: number;
  };
  delegateFactory: (tx: Prisma.TransactionClient) => RecordDelegate;
  recalcIndicators: (tx: Prisma.TransactionClient) => Promise<void>;
}

const REGISTRY: Record<string, ModuleDefinition> = {
  rdo: {
    batchSchema: rdoBatchSchema,
    toIncrementalRecords: rdoToIncremental,
    delegateFactory: createRdoDelegate,
    recalcIndicators: recalcRdoIndicators,
  },
  idp: {
    batchSchema: idpBatchSchema,
    toIncrementalRecords: idpToIncremental,
    delegateFactory: createIdpDelegate,
    recalcIndicators: recalcIdpIndicators,
  },
  rnc: {
    batchSchema: rncBatchSchema,
    toIncrementalRecords: rncToIncremental,
    delegateFactory: createRncDelegate,
    recalcIndicators: recalcRncIndicators,
  },
  "cinco-s": {
    batchSchema: fiveSBatchSchema,
    toIncrementalRecords: fiveSToIncremental,
    delegateFactory: createFiveSDelegate,
    recalcIndicators: recalcFiveSIndicators,
  },
};

export function getModuleDefinition(module: string): ModuleDefinition | null {
  return REGISTRY[module] ?? null;
}

export function migratedModules(): string[] {
  return Object.keys(REGISTRY);
}

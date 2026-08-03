/**
 * Auditoria de operações. Nunca armazena senhas, tokens ou segredos.
 */

import { prisma } from "@/server/database/prisma";
import { toJsonValue, type JsonInput } from "@/server/database/json";

export interface AuditInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  previousData?: JsonInput;
  newData?: JsonInput;
  metadata?: JsonInput;
}

const SENSITIVE_KEYS = ["password", "passwordhash", "token", "secret", "senha"];

/** Remove campos sensíveis de objetos antes de auditar. */
function redact(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.includes(k.toLowerCase())) out[k] = "[REDACTED]";
    else out[k] = redact(v);
  }
  return out;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      previousData: toJsonValue(redact(input.previousData)),
      newData: toJsonValue(redact(input.newData)),
      metadata: toJsonValue(redact(input.metadata)),
    },
  });
}

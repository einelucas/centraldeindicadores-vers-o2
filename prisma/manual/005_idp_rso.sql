-- Nova fonte do IDP: documentos PDF RSO.
-- Mantém IdpRecord (legado Uso de Atribuições) intacta para evitar perda de dados.

CREATE TABLE IF NOT EXISTS "IdpRsoRecord" (
  "id" TEXT NOT NULL,
  "businessKey" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "rsoNumero" INTEGER,
  "referenceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fileName" TEXT NOT NULL,
  "areas" JSONB NOT NULL,
  "discData" JSONB NOT NULL,
  "execucaoFases" JSONB NOT NULL,
  "raw" JSONB NOT NULL,
  "firstImportId" TEXT NOT NULL,
  "lastImportId" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdpRsoRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "IdpRsoRecord_businessKey_key"
  ON "IdpRsoRecord"("businessKey");
CREATE INDEX IF NOT EXISTS "IdpRsoRecord_unit_idx"
  ON "IdpRsoRecord"("unit");
CREATE INDEX IF NOT EXISTS "IdpRsoRecord_unit_rsoNumero_idx"
  ON "IdpRsoRecord"("unit", "rsoNumero");
CREATE INDEX IF NOT EXISTS "IdpRsoRecord_updatedAt_idx"
  ON "IdpRsoRecord"("updatedAt");


-- Compatibilidade para ambientes que já executaram a primeira versão deste upgrade.
ALTER TABLE "IdpRsoRecord"
  ADD COLUMN IF NOT EXISTS "referenceDate" TIMESTAMP(3);

UPDATE "IdpRsoRecord"
SET "referenceDate" = COALESCE("referenceDate", "updatedAt", CURRENT_TIMESTAMP)
WHERE "referenceDate" IS NULL;

ALTER TABLE "IdpRsoRecord"
  ALTER COLUMN "referenceDate" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "referenceDate" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "IdpRsoRecord_referenceDate_idx"
  ON "IdpRsoRecord"("referenceDate");

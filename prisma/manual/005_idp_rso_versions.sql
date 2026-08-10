-- IDP / RSO semanal: cria a tabela nova e também atualiza uma eventual versão
-- anterior do patch que armazenava apenas referenceDate.

CREATE TABLE IF NOT EXISTS "IdpRsoRecord" (
  "id" TEXT NOT NULL,
  "businessKey" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "detectedUnit" TEXT,
  "unitAdjusted" BOOLEAN NOT NULL DEFAULT false,
  "rsoNumero" INTEGER NOT NULL,
  "detectedRsoNumero" INTEGER,
  "rsoAdjusted" BOOLEAN NOT NULL DEFAULT false,
  "referenceYear" INTEGER NOT NULL,
  "referenceMonth" INTEGER NOT NULL,
  "detectedReferenceYear" INTEGER,
  "detectedReferenceMonth" INTEGER,
  "referenceSource" TEXT NOT NULL,
  "referenceOriginalText" TEXT,
  "referenceAdjusted" BOOLEAN NOT NULL DEFAULT false,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "emissionDate" TIMESTAMP(3),
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

-- Compatibilidade com uma eventual tabela IdpRsoRecord de patch anterior.
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "detectedUnit" TEXT;
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "unitAdjusted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "detectedRsoNumero" INTEGER;
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "rsoAdjusted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "referenceYear" INTEGER;
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "referenceMonth" INTEGER;
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "detectedReferenceYear" INTEGER;
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "detectedReferenceMonth" INTEGER;
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "referenceSource" TEXT NOT NULL DEFAULT 'PDF_MES_REF';
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "referenceOriginalText" TEXT;
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "referenceAdjusted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "periodStart" TIMESTAMP(3);
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "periodEnd" TIMESTAMP(3);
ALTER TABLE "IdpRsoRecord" ADD COLUMN IF NOT EXISTS "emissionDate" TIMESTAMP(3);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'IdpRsoRecord' AND column_name = 'referenceDate'
  ) THEN
    EXECUTE 'UPDATE "IdpRsoRecord"
      SET "referenceYear" = COALESCE("referenceYear", EXTRACT(YEAR FROM "referenceDate")::INTEGER),
          "referenceMonth" = COALESCE("referenceMonth", EXTRACT(MONTH FROM "referenceDate")::INTEGER),
          "detectedReferenceYear" = COALESCE("detectedReferenceYear", EXTRACT(YEAR FROM "referenceDate")::INTEGER),
          "detectedReferenceMonth" = COALESCE("detectedReferenceMonth", EXTRACT(MONTH FROM "referenceDate")::INTEGER)';
  END IF;
END $$;

UPDATE "IdpRsoRecord"
SET "detectedUnit" = COALESCE("detectedUnit", "unit"),
    "detectedRsoNumero" = COALESCE("detectedRsoNumero", "rsoNumero")
WHERE "detectedUnit" IS NULL OR "detectedRsoNumero" IS NULL;

-- Se houver linhas legadas sem competência, elas não devem entrar silenciosamente
-- em nenhum cálculo. A migração para NOT NULL só é aplicada quando todas estão resolvidas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "IdpRsoRecord" WHERE "referenceYear" IS NULL OR "referenceMonth" IS NULL
  ) THEN
    ALTER TABLE "IdpRsoRecord" ALTER COLUMN "referenceYear" SET NOT NULL;
    ALTER TABLE "IdpRsoRecord" ALTER COLUMN "referenceMonth" SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "IdpRsoRecord_businessKey_key"
  ON "IdpRsoRecord"("businessKey");
CREATE INDEX IF NOT EXISTS "IdpRsoRecord_referenceYear_referenceMonth_idx"
  ON "IdpRsoRecord"("referenceYear", "referenceMonth");
CREATE INDEX IF NOT EXISTS "IdpRsoRecord_unit_rsoNumero_idx"
  ON "IdpRsoRecord"("unit", "rsoNumero");

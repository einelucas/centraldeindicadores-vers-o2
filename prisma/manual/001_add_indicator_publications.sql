-- Etapa 2: snapshots publicados dos indicadores.
-- Esta migration apenas cria uma tabela nova; não altera nem apaga dados existentes.
CREATE TABLE IF NOT EXISTS "IndicatorPublication" (
  "id" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "indicator" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "target" DOUBLE PRECISION,
  "result" DOUBLE PRECISION,
  "status" TEXT,
  "payload" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "publishedById" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IndicatorPublication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IndicatorPublication_publishedById_fkey"
    FOREIGN KEY ("publishedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IndicatorPublication_module_indicator_version_key"
  ON "IndicatorPublication"("module", "indicator", "version");

CREATE INDEX IF NOT EXISTS "IndicatorPublication_module_indicator_active_publishedAt_idx"
  ON "IndicatorPublication"("module", "indicator", "active", "publishedAt");

CREATE INDEX IF NOT EXISTS "IndicatorPublication_publishedById_idx"
  ON "IndicatorPublication"("publishedById");

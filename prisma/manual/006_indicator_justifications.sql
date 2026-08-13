CREATE TABLE IF NOT EXISTS "IndicatorJustification" (
  "id" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "result" DOUBLE PRECISION,
  "target" DOUBLE PRECISION,
  "status" TEXT,
  "evidence" JSONB,
  "suggestedText" TEXT,
  "text" TEXT NOT NULL,
  "sourceImportId" TEXT,
  "sourceImportedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IndicatorJustification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IndicatorJustification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "IndicatorJustification_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "IndicatorJustification_module_year_month_key"
  ON "IndicatorJustification"("module", "year", "month");
CREATE INDEX IF NOT EXISTS "IndicatorJustification_module_year_month_idx"
  ON "IndicatorJustification"("module", "year", "month");
CREATE INDEX IF NOT EXISTS "IndicatorJustification_createdById_idx"
  ON "IndicatorJustification"("createdById");
CREATE INDEX IF NOT EXISTS "IndicatorJustification_updatedById_idx"
  ON "IndicatorJustification"("updatedById");

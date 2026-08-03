-- Taxa de Acidentes
-- Estrutura dos lançamentos mensais e das quantidades CAF/SAF por unidade.

CREATE TABLE IF NOT EXISTS "AccidentMonthlyRecord" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "rate" DOUBLE PRECISION NOT NULL,
  "caf" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccidentMonthlyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccidentMonthlyRecord_year_month_key"
  ON "AccidentMonthlyRecord"("year", "month");
CREATE INDEX IF NOT EXISTS "AccidentMonthlyRecord_year_month_idx"
  ON "AccidentMonthlyRecord"("year", "month");

DO $$
DECLARE
  needs_upgrade BOOLEAN;
BEGIN
  needs_upgrade :=
    to_regclass('"AccidentUnitRecord"') IS NULL
    OR EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'AccidentUnitRecord'
        AND column_name = 'days'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'AccidentUnitRecord'
        AND column_name = 'year'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'AccidentUnitRecord'
        AND column_name = 'month'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'AccidentUnitRecord'
        AND column_name = 'saf'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'AccidentUnitRecord'
        AND column_name = 'caf'
    );

  IF needs_upgrade THEN
    DROP TABLE IF EXISTS "AccidentUnitRecord";

    CREATE TABLE "AccidentUnitRecord" (
      "id" TEXT NOT NULL,
      "year" INTEGER NOT NULL,
      "month" INTEGER NOT NULL,
      "unit" TEXT NOT NULL,
      "unitKey" TEXT NOT NULL,
      "saf" INTEGER NOT NULL,
      "caf" INTEGER NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "AccidentUnitRecord_pkey" PRIMARY KEY ("id")
    );

    IF to_regclass('"IndicatorPublication"') IS NOT NULL THEN
      UPDATE "IndicatorPublication"
        SET "active" = FALSE
        WHERE "module" = 'taxa-acidentes' AND "active" = TRUE;
    END IF;
  END IF;
END $$;

DROP INDEX IF EXISTS "AccidentUnitRecord_unitKey_key";
DROP INDEX IF EXISTS "AccidentUnitRecord_days_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "AccidentUnitRecord_year_month_unitKey_key"
  ON "AccidentUnitRecord"("year", "month", "unitKey");
CREATE INDEX IF NOT EXISTS "AccidentUnitRecord_year_month_idx"
  ON "AccidentUnitRecord"("year", "month");
CREATE INDEX IF NOT EXISTS "AccidentUnitRecord_unit_idx"
  ON "AccidentUnitRecord"("unit");

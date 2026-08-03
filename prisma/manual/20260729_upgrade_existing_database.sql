-- Remove dados e estruturas dos módulos retirados do ciclo vigente.
-- As verificações tornam a migração segura em bancos onde alguma tabela
-- antiga já tenha sido removida manualmente.

DO $$
BEGIN
  IF to_regclass('"ImportJob"') IS NOT NULL THEN
    IF to_regclass('"ImportError"') IS NOT NULL THEN
      DELETE FROM "ImportError"
      WHERE "importJobId" IN (
        SELECT "id" FROM "ImportJob"
        WHERE "module" IN (
          'idc', 'idc-forecast', 'idc-realizado',
          'treinamentos', 'training', 'nej',
          'taxa-desligamento', 'turnover'
        )
      );
    END IF;

    IF to_regclass('"ImportBatch"') IS NOT NULL THEN
      DELETE FROM "ImportBatch"
      WHERE "importJobId" IN (
        SELECT "id" FROM "ImportJob"
        WHERE "module" IN (
          'idc', 'idc-forecast', 'idc-realizado',
          'treinamentos', 'training', 'nej',
          'taxa-desligamento', 'turnover'
        )
      );
    END IF;

    DELETE FROM "ImportJob"
    WHERE "module" IN (
      'idc', 'idc-forecast', 'idc-realizado',
      'treinamentos', 'training', 'nej',
      'taxa-desligamento', 'turnover'
    );
  END IF;

  IF to_regclass('"IndicatorResult"') IS NOT NULL THEN
    DELETE FROM "IndicatorResult"
    WHERE "module" IN (
      'idc', 'treinamentos', 'training', 'nej',
      'taxa-desligamento', 'turnover'
    );
  END IF;

  IF to_regclass('"IndicatorPublication"') IS NOT NULL THEN
    DELETE FROM "IndicatorPublication"
    WHERE "module" IN (
      'idc', 'treinamentos', 'training', 'nej',
      'taxa-desligamento', 'turnover'
    );
  END IF;

  IF to_regclass('"AppSetting"') IS NOT NULL THEN
    DELETE FROM "AppSetting"
    WHERE "key" LIKE 'idc.%'
       OR "key" LIKE 'training.%'
       OR "key" LIKE 'nej.%'
       OR "key" LIKE 'taxa-desligamento.%'
       OR "key" LIKE 'turnover.%';

    INSERT INTO "AppSetting" ("key", "value", "updatedAt")
    VALUES
      ('rdo.target', '0.8'::jsonb, NOW()),
      ('idp.target', '0.9'::jsonb, NOW()),
      ('fiveS.target', '0.9'::jsonb, NOW()),
      ('fiveS.excludedUnits', '["SP","CSC"]'::jsonb, NOW()),
      ('rnc.maxPrazoDias', '15'::jsonb, NOW()),
      ('taxa-acidentes.target', '7.5'::jsonb, NOW())
    ON CONFLICT ("key") DO UPDATE
    SET "value" = EXCLUDED."value", "updatedAt" = NOW();
  END IF;
END $$;

DROP TABLE IF EXISTS "SupplierAlias";
DROP TABLE IF EXISTS "Supplier";
DROP TABLE IF EXISTS "NejDecision";
DROP TABLE IF EXISTS "NejMondayRecord";
DROP TABLE IF EXISTS "NejRecord";
DROP TABLE IF EXISTS "TrainingRecord";
DROP TABLE IF EXISTS "TurnoverRecord";
DROP TABLE IF EXISTS "IdcActualRecord";
DROP TABLE IF EXISTS "IdcForecastRecord";


-- Substitui o antigo controle de "dias sem acidente" por quantidades mensais
-- de acidentes CAF e SAF por unidade. Os dados antigos são incompatíveis com
-- o novo significado e só são removidos quando a estrutura legada é detectada.

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

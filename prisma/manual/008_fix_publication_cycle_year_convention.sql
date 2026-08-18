-- Corrige a regra oficial de rotulagem do S1 em IndicatorPublication: o
-- "ano do período" agora é o ano de TÉRMINO (maio), não o de início
-- (dezembro) — ver cycleFromYearSemester em src/lib/period.ts. Antes:
-- S1 "ano X" = Dez/X - Mai/(X+1). Agora: S1 "ano X" = Dez/(X-1) - Mai/X.
--
-- Esta migração só ajusta a CHECK constraint (validação de forma, não
-- dado). Os valores de cycleYear já gravados por
-- scripts/backfill-publication-cycle.ts precisam ser recalculados à parte
-- (pnpm db:backfill:publication-cycle, executado de novo depois desta
-- migração) — seguro porque a coluna é 100% derivada do payload publicado,
-- nunca a fonte de verdade em si.
--
-- A constraint é adicionada como NOT VALID: linhas existentes (ainda com o
-- cycleYear calculado pela convenção antiga) não são validadas agora — só
-- INSERTs/UPDATEs a partir daqui já seguem a regra nova. Depois de rodar o
-- backfill, rode prisma/manual/009_validate_publication_cycle_constraint.sql
-- para confirmar que todas as linhas passam a satisfazer a regra nova e
-- marcar a constraint como validada.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'IndicatorPublication_cycle_consistency_check'
  ) THEN
    ALTER TABLE "IndicatorPublication"
      DROP CONSTRAINT "IndicatorPublication_cycle_consistency_check";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'IndicatorPublication_cycle_consistency_check'
  ) THEN
    ALTER TABLE "IndicatorPublication"
      ADD CONSTRAINT "IndicatorPublication_cycle_consistency_check"
      CHECK (
        "cycleYear" IS NULL OR (
          ("cycleSemester" = 'S2' AND "periodStartYear" = "cycleYear" AND "periodStartMonth" = 6
            AND "periodEndYear" = "cycleYear" AND "periodEndMonth" = 11)
          OR
          ("cycleSemester" = 'S1' AND "periodStartYear" = "cycleYear" - 1 AND "periodStartMonth" = 12
            AND "periodEndYear" = "cycleYear" AND "periodEndMonth" = 5)
        )
      ) NOT VALID;
  END IF;
END $$;

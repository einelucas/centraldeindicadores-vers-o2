-- Colunas de ciclo/período em IndicatorPublication, para deixar Ano+Semestre
-- consultável no banco (hoje só existe dentro de payload, em formatos
-- diferentes por módulo) e permitir no máximo uma publicação ativa por
-- módulo+indicador+ciclo. Aditivo e idempotente — todas as colunas nullable,
-- sem alterar nem apagar dado existente.

ALTER TABLE "IndicatorPublication"
  ADD COLUMN IF NOT EXISTS "cycleYear" INTEGER,
  ADD COLUMN IF NOT EXISTS "cycleSemester" TEXT,
  ADD COLUMN IF NOT EXISTS "periodStartYear" INTEGER,
  ADD COLUMN IF NOT EXISTS "periodStartMonth" INTEGER,
  ADD COLUMN IF NOT EXISTS "periodEndYear" INTEGER,
  ADD COLUMN IF NOT EXISTS "periodEndMonth" INTEGER;

CREATE INDEX IF NOT EXISTS "IndicatorPublication_module_indicator_cycle_idx"
  ON "IndicatorPublication"("module", "indicator", "cycleYear", "cycleSemester");

-- No máximo uma publicação ATIVA por módulo+indicador+ciclo. NULL é tratado
-- como distinto de qualquer outro NULL pelo Postgres em índices únicos, então
-- linhas legadas sem ciclo definido (cycleYear IS NULL) nunca colidem entre
-- si aqui.
CREATE UNIQUE INDEX IF NOT EXISTS "IndicatorPublication_active_cycle_key"
  ON "IndicatorPublication"("module", "indicator", "cycleYear", "cycleSemester")
  WHERE "active" = true;

-- Garante que as duas famílias de colunas (cycleYear/cycleSemester e
-- periodStart.../periodEnd...) nunca fiquem inconsistentes entre si, mesmo
-- se alguém atualizar uma linha manualmente no futuro. Postgres não suporta
-- "ADD CONSTRAINT IF NOT EXISTS" para CHECK — o bloco DO abaixo é o jeito
-- idiomático de deixar isso idempotente (mesmo cuidado dos outros scripts
-- desta pasta, que usam "IF NOT EXISTS" em tudo que suporta).
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
          ("cycleSemester" = 'S1' AND "periodStartYear" = "cycleYear" AND "periodStartMonth" = 12
            AND "periodEndYear" = "cycleYear" + 1 AND "periodEndMonth" = 5)
        )
      );
  END IF;
END $$;

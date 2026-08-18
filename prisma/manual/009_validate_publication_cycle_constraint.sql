-- Roda depois de 008_fix_publication_cycle_year_convention.sql (que adiciona
-- a constraint como NOT VALID) e depois de "pnpm db:backfill:publication-cycle"
-- (que recalcula cycleYear/cycleSemester de todas as linhas pela convenção
-- nova). Confirma que toda linha existente já satisfaz a regra nova e marca
-- a constraint como validada — se alguma linha ainda violar (backfill não
-- rodou, ou algo ficou fora do formato semestral canônico), este comando
-- falha e nada é marcado, sem mexer em dado nenhum.
ALTER TABLE "IndicatorPublication"
  VALIDATE CONSTRAINT "IndicatorPublication_cycle_consistency_check";

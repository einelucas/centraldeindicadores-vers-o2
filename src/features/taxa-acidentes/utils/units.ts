/** Unidades da Taxa de Acidentes — delega ao cadastro canônico compartilhado. */

export {
  UNITS as ACCIDENT_UNITS,
  normalizeUnitCode as normalizeAccidentUnitCode,
  formatUnitLabel as formatAccidentUnitLabel,
  compareUnits as compareAccidentUnits,
  type UnitDefinition as AccidentUnitDefinition,
} from "@/lib/units";

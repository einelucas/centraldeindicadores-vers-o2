export const INDICATOR_DATA_CHANGED_EVENT = "indicator:data-changed";

/** Notifica componentes montados de que as competências disponíveis podem ter mudado. */
export function notifyIndicatorDataChanged(): void {
  window.dispatchEvent(new Event(INDICATOR_DATA_CHANGED_EVENT));
}

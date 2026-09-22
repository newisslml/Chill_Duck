export type BudgetStatus = 'none' | 'ok' | 'warning' | 'over';

export const WARNING_RATIO = 0.8;

/** Estado frente a un tope. Sin tope configurado (0) no hay estado. */
export function budgetStatus(spent: number, cap: number): BudgetStatus {
  if (cap <= 0) return 'none';
  const ratio = spent / cap;
  if (ratio >= 1) return 'over';
  if (ratio >= WARNING_RATIO) return 'warning';
  return 'ok';
}

/**
 * Umbral cruzado por un gasto nuevo (0.8 o 1), o null si no cruzó ninguno.
 * Se evalúa antes/después para avisar una sola vez por umbral.
 */
export function crossedThreshold(before: number, after: number, cap: number): 0.8 | 1 | null {
  if (cap <= 0) return null;
  if (before < cap && after >= cap) return 1;
  if (before < cap * WARNING_RATIO && after >= cap * WARNING_RATIO) return 0.8;
  return null;
}

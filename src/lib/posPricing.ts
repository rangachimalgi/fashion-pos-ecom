export function clampDiscountPercent(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function discountedUnitPrice(mrp: number, discountPercent = 0) {
  const pct = clampDiscountPercent(discountPercent);
  return Math.round(mrp * (1 - pct / 100) * 100) / 100;
}

export function posLineTotal(mrp: number, quantity: number, discountPercent = 0) {
  return Math.round(discountedUnitPrice(mrp, discountPercent) * quantity * 100) / 100;
}

/**
 * Lowest margin over cost a discounted POS line may be sold at.
 * UI mirror only: the database enforces it (public.min_margin_percent, migration 015).
 */
export const MIN_MARGIN_PERCENT = 5;

/** Lowest unit price allowed for a discounted line, or null when cost is unknown. */
export function minUnitPrice(cost: number | null | undefined) {
  if (cost == null || !Number.isFinite(Number(cost))) return null;
  return Math.round(Number(cost) * (1 + MIN_MARGIN_PERCENT / 100) * 100) / 100;
}

/**
 * Biggest discount (percent, 2 decimals, rounded down) that keeps the price at
 * or above cost + MIN_MARGIN_PERCENT. 100 when cost is unknown (no floor).
 */
export function maxDiscountForMargin(mrp: number, cost: number | null | undefined) {
  const floor = minUnitPrice(cost);
  if (floor == null || !(mrp > 0)) return 100;
  if (floor >= mrp) return 0;
  return Math.floor((1 - floor / mrp) * 100 * 100) / 100;
}

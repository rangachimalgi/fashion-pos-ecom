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

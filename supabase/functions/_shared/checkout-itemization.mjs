// Stripe Checkout prices must be non-negative integer cents. Keep discounted
// APS invoice rows intact and charge their net balance through the existing
// balance-only fallback when those rows cannot be represented exactly.
export function canItemizeCheckout(items, balanceDue) {
  if (!items.length || !Number.isFinite(balanceDue) || balanceDue <= 0) return false;
  let cents = 0;
  for (const item of items) {
    const quantity = Number(item.quantity), unit = Number(item.unit_price), line = Number(item.line_total);
    if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unit) || unit < 0 || !Number.isFinite(line) || line < 0) return false;
    const lineCents = Math.round(unit * 100) * quantity;
    if (Math.abs(lineCents - Math.round(line * 100)) > 0) return false;
    cents += lineCents;
  }
  return cents === Math.round(balanceDue * 100);
}

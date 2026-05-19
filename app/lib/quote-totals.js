// Pure function used by both the admin drawer (live preview) and the public quote page.
// Returns whole-dirham integer values; no rounding tricks needed at AED scale.

export function computeTotals(lineItems = [], vatPercent = 5) {
  const subtotal = lineItems.reduce((sum, li) => {
    const qty = Number(li.qty) || 0;
    const unit = Number(li.unitPrice) || 0;
    return sum + qty * unit;
  }, 0);
  const vat = Math.round((subtotal * vatPercent) / 100);
  const grandTotal = subtotal + vat;
  return { subtotal, vat, grandTotal };
}

export function formatAED(n) {
  return new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n);
}

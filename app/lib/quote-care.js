// Care-plan values shown in the admin quote editor when a quote is opened.
// Quotes created from leads/estimates already store careMonthly/carePlanName,
// so those values are kept exactly. A quote with no care field at all used to
// open as "Care Basic · AED 149" and saving then stored it; it now opens as
// "No monthly plan" (AED 0) until the admin picks a plan.

export const NO_CARE_PLAN_NAME = 'No monthly plan';

const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

export function resolveQuoteCareForEditing(quote = {}) {
  const lines = Array.isArray(quote.lineItems) ? quote.lineItems : [];
  const legacyCare = lines.find((line) => line?.catalogKey === 'monthly-care');
  const snapshot = quote.estimateSnapshot?.monthly || null;

  let careMonthly;
  if (hasValue(quote.careMonthly)) careMonthly = Number(quote.careMonthly) || 0;
  else if (Number(snapshot?.amount) > 0) careMonthly = Number(snapshot.amount);
  else if (legacyCare && Number(legacyCare.unitPrice) > 0) careMonthly = Number(legacyCare.unitPrice);
  else careMonthly = 0;

  const legacyName = typeof legacyCare?.name === 'object' ? legacyCare.name?.en : legacyCare?.name;
  const carePlanName = careMonthly > 0
    ? (quote.carePlanName || snapshot?.planName || legacyName || 'Care Basic')
    : NO_CARE_PLAN_NAME;

  return { careMonthly, carePlanName };
}

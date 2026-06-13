import { displayAED, type Fils } from './money.js';
import type { PricingResult } from './engine.js';

export function formatEstimateText(estimate: Record<string, any>, { businessName = '' } = {}): string {
  const fmt = (n: number) => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n);
  const out: string[] = [];
  out.push('QD Systems — Project Estimate (internal draft)');
  if (businessName) out.push(`Client: ${businessName}`);
  out.push(`Date: ${new Date().toISOString().slice(0, 10)} · Pricing model v${estimate.version}`);
  out.push('');
  for (const line of estimate.lines || []) {
    const fromTag = line.from ? 'from ' : '';
    const tierTag = line.tier && line.tier !== 'low' ? ` (${line.tier} scope)` : '';
    const amount = line.amount < 0 ? `−AED ${fmt(Math.abs(line.amount))}` : `${fromTag}AED ${fmt(line.amount)}`;
    out.push(`- ${line.label}${tierTag}: ${amount}`);
  }
  out.push('');
  out.push(`One-time subtotal: AED ${fmt(estimate.subtotal)}${estimate.openEnded ? ' (contains "from" items — final scope may increase)' : ''}`);
  if (estimate.discountAmount > 0) {
    out.push(`After founding-client discount (−${estimate.discountPercent}%): AED ${fmt(estimate.discountedSubtotal)}`);
  }
  out.push(`VAT ${estimate.vatPercent}%: AED ${fmt(estimate.vat)}`);
  out.push(`One-time total: AED ${fmt(estimate.grandTotal)}`);
  if (estimate.subtotalLow !== estimate.subtotalHigh) {
    out.push(`Scope range (pre-VAT): AED ${fmt(estimate.subtotalLow)} – ${fmt(estimate.subtotalHigh)}`);
  }
  if (estimate.monthly?.amount > 0) {
    out.push(`Monthly: ${estimate.monthly.planName} — AED ${fmt(estimate.monthly.amount)}/mo${estimate.monthly.usage ? ' + usage' : ''}`);
  }
  if (estimate.monthly?.softwarePassThrough) {
    out.push('Third-party software & usage fees (payments, WhatsApp/SMS, APIs) billed at cost — not included above.');
  }
  if (estimate.bandCheck) {
    const [lo, hi] = estimate.bandCheck.band;
    out.push(`Industry band check: ${estimate.bandCheck.status} recommended band (AED ${fmt(lo)} – ${fmt(hi)} build).`);
  }
  if (estimate.uaeCheck) {
    const [lo, hi] = estimate.uaeCheck.band;
    out.push(`UAE market check: ${estimate.uaeCheck.status} verified local range AED ${fmt(lo)} – ${fmt(hi)} (${estimate.uaeCheck.label}).`);
  }
  if (estimate.approval) out.push(`Approval: ${estimate.approval}${estimate.flags?.length ? ` (${estimate.flags.join(', ')})` : ''}.`);
  if (Number.isFinite(estimate.marginPercent)) out.push(`Internal margin: ${estimate.marginPercent}%.`);
  if (estimate.floorBound) out.push('Cost floor applied: discount was capped to protect minimum gross margin.');
  return out.join('\n');
}

export function threeLineClientView(result: PricingResult): readonly string[] {
  const buildFee = formatFils(result.net);
  const passThrough = result.passThrough.length
    ? 'Third-party software and usage: billed at cost'
    : 'Third-party software and usage: none included';
  const monthly = result.monthly.amount > 0
    ? `${result.monthly.planName}: AED ${formatFils(result.monthly.amount)}/mo${result.monthly.usage ? ' + usage' : ''}`
    : 'Monthly care: optional';
  return [
    `QD build fee: AED ${buildFee} + VAT`,
    passThrough,
    monthly
  ];
}

function formatFils(value: Fils): string {
  return new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(displayAED(value, 'aed'));
}

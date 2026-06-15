import { computeTotals } from '../../app/lib/quote-totals.js';
import { buildQuotePaymentFields, normalizePaymentList, roundMoney } from './quote-payments.js';
import { getQuoteWorkflowStatus } from './quote-admin.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function parseIsoDate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  if (value._seconds) return new Date(value._seconds * 1000).toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function monthKeyFromDate(value) {
  return toIsoDate(value).slice(0, 7);
}

export function clampBillingDay(day, year, monthIndex) {
  const wanted = Math.max(1, Number(day) || 1);
  return Math.min(wanted, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate());
}

export function addDaysIso(value, days) {
  const date = parseIsoDate(value);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function compareIso(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

export function getQuoteTotal(quote = {}) {
  return roundMoney(computeTotals(quote.lineItems, quote.vatPercent, quote.pages?.price).grandTotal);
}

export function buildDefaultMilestones(total) {
  const quoteTotal = roundMoney(total);
  const advance = Math.round(quoteTotal * 0.3);
  return [
    { key: 'advance', label: '30% advance', amount: advance, dueDate: '', status: 'pending', collectedAt: '' },
    { key: 'final', label: '70% completion', amount: roundMoney(quoteTotal - advance), dueDate: '', status: 'pending', collectedAt: '' }
  ];
}

export function normalizeMilestones(quote = {}) {
  const defaults = buildDefaultMilestones(getQuoteTotal(quote));
  const existing = Array.isArray(quote.milestones) ? quote.milestones : [];
  return defaults.map((base) => {
    const found = existing.find((milestone) => milestone?.key === base.key) || {};
    return {
      ...base,
      ...found,
      label: found.label || base.label,
      amount: Number.isFinite(Number(found.amount)) ? roundMoney(found.amount) : base.amount,
      dueDate: toIsoDate(found.dueDate) || '',
      status: found.status === 'collected' ? 'collected' : 'pending',
      collectedAt: toIsoDate(found.collectedAt) || ''
    };
  });
}

export function getCareMonthly(quote = {}) {
  const direct = Number(quote.careMonthly);
  if (Number.isFinite(direct) && direct > 0) return roundMoney(direct);
  const fromSnapshot = Number(quote.estimateSnapshot?.monthly?.amount);
  return Number.isFinite(fromSnapshot) && fromSnapshot > 0 ? roundMoney(fromSnapshot) : 0;
}

export function getBillingDay(quote = {}) {
  const goLive = parseIsoDate(toIsoDate(quote.goLiveDate));
  if (!goLive) return 0;
  return Math.max(1, Math.min(31, Number(quote.billingDay) || goLive.getUTCDate()));
}

export function buildCareItems(quote = {}, on = todayIso()) {
  const goLiveDate = toIsoDate(quote.goLiveDate);
  const goLive = parseIsoDate(goLiveDate);
  const through = parseIsoDate(addDaysIso(on, 7));
  const monthly = getCareMonthly(quote);
  const billingDay = getBillingDay(quote);
  if (!goLive || !through || monthly <= 0 || billingDay <= 0) return [];

  const collected = new Set(Array.isArray(quote.careCollected) ? quote.careCollected.map(String) : []);
  const items = [];
  let year = goLive.getUTCFullYear();
  let month = goLive.getUTCMonth();
  while (new Date(Date.UTC(year, month, 1)) <= through) {
    const day = clampBillingDay(billingDay, year, month);
    const dueDate = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    if (compareIso(dueDate, goLiveDate) >= 0 && compareIso(dueDate, addDaysIso(on, 7)) <= 0 && !collected.has(monthKey)) {
      items.push({
        type: 'Monthly care',
        collectionType: 'care',
        monthKey,
        amount: monthly,
        dueDate
      });
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return items;
}

export function buildMilestoneItems(quote = {}, on = todayIso()) {
  const workflow = getQuoteWorkflowStatus(quote);
  const goLiveDate = toIsoDate(quote.goLiveDate);
  const sevenDays = addDaysIso(on, 7);
  return normalizeMilestones(quote)
    .filter((milestone) => milestone.status !== 'collected')
    .map((milestone) => {
      let dueDate = milestone.dueDate;
      if (!dueDate && milestone.key === 'advance' && ['accepted', 'paid'].includes(workflow)) dueDate = on;
      if (!dueDate && milestone.key === 'final' && goLiveDate) dueDate = goLiveDate;
      return { ...milestone, dueDate };
    })
    .filter((milestone) => milestone.dueDate && compareIso(milestone.dueDate, sevenDays) <= 0)
    .map((milestone) => ({
      type: milestone.label,
      collectionType: 'milestone',
      milestoneKey: milestone.key,
      amount: roundMoney(milestone.amount),
      dueDate: milestone.dueDate
    }));
}

export function bucketForDueDate(dueDate, on = todayIso()) {
  if (compareIso(dueDate, on) < 0) return 'overdue';
  if (compareIso(dueDate, on) === 0) return 'dueToday';
  if (compareIso(dueDate, addDaysIso(on, 7)) <= 0) return 'upcoming';
  return '';
}

export function buildCollectionItemsForQuote(quote = {}, on = todayIso()) {
  const quoteId = quote.id || '';
  const quoteNumber = quote.quoteNumber || '';
  const client = quote.customer?.businessName || '';
  return [...buildMilestoneItems(quote, on), ...buildCareItems(quote, on)]
    .map((item) => ({
      quoteId,
      quoteNumber,
      client,
      ...item,
      bucket: bucketForDueDate(item.dueDate, on)
    }))
    .filter((item) => item.bucket);
}

function emptyBucket() {
  return { total: 0, items: [] };
}

export function buildCollectionsSummary(quotes = [], on = todayIso()) {
  const buckets = {
    overdue: emptyBucket(),
    dueToday: emptyBucket(),
    upcoming: emptyBucket()
  };
  for (const quote of quotes) {
    for (const item of buildCollectionItemsForQuote(quote, on)) {
      buckets[item.bucket].items.push(item);
      buckets[item.bucket].total = roundMoney(buckets[item.bucket].total + item.amount);
    }
  }
  for (const bucket of Object.values(buckets)) {
    bucket.items.sort((a, b) => compareIso(a.dueDate, b.dueDate) || String(a.quoteNumber).localeCompare(String(b.quoteNumber)));
  }
  return {
    on,
    buckets,
    count: Object.values(buckets).reduce((sum, bucket) => sum + bucket.items.length, 0),
    total: roundMoney(Object.values(buckets).reduce((sum, bucket) => sum + bucket.total, 0))
  };
}

export function buildQuoteCollectionPatch(quote = {}, action = {}) {
  const collectedOn = toIsoDate(action.collectedOn) || todayIso();
  const method = String(action.method || 'Collection').trim();
  if (action.type === 'care') {
    const monthKey = String(action.monthKey || '').trim();
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      const error = new Error('monthKey is required');
      error.status = 400;
      throw error;
    }
    const existingCollected = Array.isArray(quote.careCollected) ? quote.careCollected.map(String) : [];
    if (existingCollected.includes(monthKey)) {
      const error = new Error('Care month already collected');
      error.status = 409;
      throw error;
    }
    const collected = Array.from(new Set([...existingCollected, monthKey])).sort();
    const payment = { amount: getCareMonthly(quote), date: collectedOn, method, note: `Care ${monthKey}` };
    return {
      careCollected: collected,
      payment
    };
  }

  if (action.type === 'milestone') {
    const milestoneKey = String(action.milestoneKey || '').trim();
    const milestones = normalizeMilestones(quote);
    const milestone = milestones.find((item) => item.key === milestoneKey);
    if (!milestone) {
      const error = new Error('milestoneKey is invalid');
      error.status = 400;
      throw error;
    }
    if (milestone.status === 'collected') {
      const error = new Error('Milestone already collected');
      error.status = 409;
      throw error;
    }
    const nextMilestones = milestones.map((item) => item.key === milestoneKey ? {
      ...item,
      status: 'collected',
      collectedAt: collectedOn
    } : item);
    const payment = { amount: milestone.amount, date: collectedOn, method, note: milestone.label };
    return {
      milestones: nextMilestones,
      payment
    };
  }

  const error = new Error('type must be care or milestone');
  error.status = 400;
  throw error;
}

export function buildQuoteFieldsAfterCollection(id, quote = {}, patch = {}) {
  const payments = [...normalizePaymentList(quote.payments), patch.payment].filter(Boolean);
  const nextQuote = {
    ...quote,
    ...patch,
    payments
  };
  delete nextQuote.payment;
  const { payment, ...writePatch } = patch;
  return {
    ...writePatch,
    payments,
    ...buildQuotePaymentFields(id, nextQuote)
  };
}

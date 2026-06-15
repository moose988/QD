import {
  applyPaymentToQuote,
  buildDefaultMilestones,
  buildQuotePaymentFields,
  buildQuotePaymentView,
  getCareMonthly,
  getQuoteBuildTotal,
  roundMoney
} from './quote-payments.js';
import { getQuoteWorkflowStatus } from './quote-admin.js';

export { buildDefaultMilestones, getCareMonthly };

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
  return getQuoteBuildTotal(quote);
}

export function normalizeMilestones(quote = {}) {
  return buildQuotePaymentView(quote.id || '', quote).milestones;
}

function milestoneDueDate(item, quote, on) {
  if (item.dueDate) return item.dueDate;
  const workflow = getQuoteWorkflowStatus(quote);
  if (item.key === 'advance' && ['accepted', 'paid'].includes(workflow)) return on;
  if (item.key === 'final' && toIsoDate(quote.goLiveDate)) return toIsoDate(quote.goLiveDate);
  return '';
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
  const paymentView = buildQuotePaymentView(quoteId, quote, { on });
  return paymentView.schedule
    .map((item) => {
      const dueDate = item.itemKey.startsWith('milestone:') ? milestoneDueDate(item, quote, on) : item.dueDate;
      return { ...item, dueDate };
    })
    .filter((item) => item.remaining > 0 && item.dueDate && compareIso(item.dueDate, addDaysIso(on, 7)) <= 0)
    .map((item) => ({
      quoteId,
      quoteNumber,
      client,
      itemKey: item.itemKey,
      type: item.itemKey.startsWith('care:') ? 'Monthly care' : item.label,
      label: item.label,
      collectionType: item.itemKey.startsWith('care:') ? 'care' : 'milestone',
      monthKey: item.itemKey.startsWith('care:') ? item.key : '',
      milestoneKey: item.itemKey.startsWith('milestone:') ? item.key : '',
      amount: item.remaining,
      remaining: item.remaining,
      itemAmount: item.amount,
      paidAmount: item.paidAmount,
      dueDate: item.dueDate,
      outstanding: paymentView.outstanding,
      balance: paymentView.balance,
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
  const itemKey = String(action.itemKey || (action.type === 'care' ? `care:${action.monthKey || ''}` : `milestone:${action.milestoneKey || ''}`)).trim();
  const collectedOn = toIsoDate(action.collectedOn) || todayIso();
  const method = String(action.method || 'Collection').trim();
  const view = buildQuotePaymentView(quote.id || '', quote, { on: collectedOn });
  const item = view.schedule.find((entry) => entry.itemKey === itemKey);
  if (!item) {
    const error = new Error('itemKey does not match a payable schedule item');
    error.status = 400;
    throw error;
  }
  if (item.remaining <= 0) {
    const error = new Error('Schedule item already paid');
    error.status = 409;
    throw error;
  }
  const amount = action.amount != null ? roundMoney(action.amount) : item.remaining;
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('amount must be greater than 0');
    error.status = 400;
    throw error;
  }
  if (amount > item.remaining) {
    const error = new Error('amount exceeds remaining item balance');
    error.status = 400;
    throw error;
  }
  return {
    payment: {
      itemKey,
      amount,
      date: collectedOn,
      method,
      note: item.itemKey.startsWith('care:') ? item.label : item.label
    }
  };
}

export function buildQuoteFieldsAfterCollection(id, quote = {}, patch = {}) {
  if (!patch.payment) return buildQuotePaymentFields(id, quote);
  const nextQuote = applyPaymentToQuote(id, quote, patch.payment, { on: patch.payment.date });
  return buildQuotePaymentFields(id, nextQuote, { on: patch.payment.date });
}

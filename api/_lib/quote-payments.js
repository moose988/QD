import { computeTotals } from '../../app/lib/quote-totals.js';

const PAYMENT_INTERNAL_FIELDS = new Set([
  'payments',
  'paid',
  'balance',
  'paymentStatus',
  'lastPaymentAt',
  'milestones',
  'careCollected',
  'careMonthly',
  'goLiveDate',
  'billingDay'
]);

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toIsoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (typeof value.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  if (value._seconds) return new Date(value._seconds * 1000).toISOString().slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function parseIsoDate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDaysIso(value, days) {
  const date = parseIsoDate(value);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compareIso(a, b) {
  return String(a || '').localeCompare(String(b || ''));
}

function clampBillingDay(day, year, monthIndex) {
  const wanted = Math.max(1, Number(day) || 1);
  return Math.min(wanted, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate());
}

export function getQuoteBuildTotal(quote = {}) {
  const oneTimeLines = (Array.isArray(quote.lineItems) ? quote.lineItems : []).filter((line) => line?.catalogKey !== 'monthly-care');
  const vatPercent = quote.vatInclusive === false ? quote.vatPercent : 0;
  return roundMoney(computeTotals(oneTimeLines, vatPercent, quote.pages?.price).grandTotal);
}

export function buildDefaultMilestones(total, existing = []) {
  const quoteTotal = roundMoney(total);
  const advance = Math.round(quoteTotal * 0.3);
  const defaults = [
    { key: 'advance', itemKey: 'milestone:advance', label: 'Advance 30%', amount: advance, dueDate: '', paidAmount: 0, collectedAt: '' },
    { key: 'final', itemKey: 'milestone:final', label: 'Final 70%', amount: roundMoney(quoteTotal - advance), dueDate: '', paidAmount: 0, collectedAt: '' }
  ];
  return defaults.map((base) => {
    const found = existing.find((item) => item?.key === base.key || item?.itemKey === base.itemKey) || {};
    const paidAmount = Number.isFinite(Number(found.paidAmount))
      ? roundMoney(found.paidAmount)
      : (found.status === 'collected' ? base.amount : 0);
    return {
      ...base,
      dueDate: toIsoDate(found.dueDate) || '',
      paidAmount,
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

function getBillingDay(quote = {}) {
  const goLive = parseIsoDate(toIsoDate(quote.goLiveDate));
  if (!goLive) return 0;
  return Math.max(1, Math.min(31, Number(quote.billingDay) || goLive.getUTCDate()));
}

function getPaymentStatusFromRemaining(amount, paidAmount) {
  const remaining = roundMoney(Math.max(0, amount - paidAmount));
  if (remaining <= 0) return 'Paid';
  if (paidAmount > 0) return 'Partial';
  return 'Unpaid';
}

function withScheduleDerived(item) {
  if (item.waived) {
    return {
      ...item,
      amount: 0,
      paidAmount: 0,
      remaining: 0,
      state: 'waived',
      status: 'waived'
    };
  }
  const paidAmount = roundMoney(Math.max(0, Number(item.paidAmount) || 0));
  const amount = roundMoney(item.amount);
  const remaining = roundMoney(Math.max(0, amount - paidAmount));
  return {
    ...item,
    amount,
    paidAmount,
    remaining,
    state: getPaymentStatusFromRemaining(amount, paidAmount),
    status: remaining <= 0 ? 'collected' : 'pending'
  };
}

function baseMilestones(quote = {}) {
  return buildDefaultMilestones(getQuoteBuildTotal(quote), Array.isArray(quote.milestones) ? quote.milestones : []);
}

function baseCareItems(quote = {}, on = new Date().toISOString().slice(0, 10)) {
  const goLiveDate = toIsoDate(quote.goLiveDate);
  const goLive = parseIsoDate(goLiveDate);
  const through = parseIsoDate(addDaysIso(on, 7));
  const monthly = getCareMonthly(quote);
  const billingDay = getBillingDay(quote);
  if (!goLive || !through || monthly <= 0 || billingDay <= 0) return [];

  const legacyCollected = new Set(Array.isArray(quote.careCollected) ? quote.careCollected.map(String) : []);
  const waived = new Set(Array.isArray(quote.careWaived) ? quote.careWaived.map(String) : []);
  const items = [];
  let firstCareMonth = true;
  let year = goLive.getUTCFullYear();
  let month = goLive.getUTCMonth();
  while (new Date(Date.UTC(year, month, 1)) <= through) {
    const day = clampBillingDay(billingDay, year, month);
    const dueDate = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    if (compareIso(dueDate, goLiveDate) >= 0 && compareIso(dueDate, addDaysIso(on, 7)) <= 0) {
      const isWaived = waived.has(monthKey) || (quote.firstMonthFree === true && firstCareMonth);
      items.push({
        key: monthKey,
        itemKey: `care:${monthKey}`,
        label: `Care ${monthKey}`,
        type: 'Monthly care',
        amount: isWaived ? 0 : monthly,
        dueDate,
        paidAmount: legacyCollected.has(monthKey) && !isWaived ? monthly : 0,
        waived: isWaived
      });
      firstCareMonth = false;
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return items;
}

function normalizeStoredPayment(input = {}) {
  const amount = roundMoney(input.amount);
  return {
    itemKey: String(input.itemKey || '').trim(),
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    date: String(input.date || '').trim(),
    method: String(input.method || '').trim(),
    note: String(input.note || '').trim()
  };
}

function allocateLegacyPayment(payment, schedule) {
  let remainingPayment = payment.amount;
  const records = [];
  for (const item of schedule) {
    if (remainingPayment <= 0) break;
    const remainingItem = roundMoney(Math.max(0, item.amount - item.paidAmount));
    if (remainingItem <= 0) continue;
    const amount = roundMoney(Math.min(remainingPayment, remainingItem));
    item.paidAmount = roundMoney(item.paidAmount + amount);
    remainingPayment = roundMoney(remainingPayment - amount);
    records.push({ ...payment, itemKey: item.itemKey, amount });
  }
  if (remainingPayment > 0 && schedule.length) {
    const item = schedule[schedule.length - 1];
    item.paidAmount = roundMoney(item.paidAmount + remainingPayment);
    records.push({ ...payment, itemKey: item.itemKey, amount: remainingPayment });
  }
  return records;
}

function buildBaseSchedule(quote = {}, on) {
  return [...baseMilestones(quote), ...baseCareItems(quote, on)].map((item) => ({ ...item, paidAmount: Number(item.paidAmount) || 0 }));
}

export function normalizePaymentList(payments = [], quote = {}, options = {}) {
  if (!Array.isArray(payments)) return [];
  const schedule = buildBaseSchedule(quote, options.on || new Date().toISOString().slice(0, 10));
  const normalized = [];
  for (const raw of payments) {
    const payment = normalizeStoredPayment(raw);
    if (payment.amount <= 0) continue;
    if (payment.itemKey) normalized.push(payment);
    else normalized.push(...allocateLegacyPayment(payment, schedule));
  }
  return normalized;
}

export function normalizePaymentInput(input = {}) {
  const payment = normalizeStoredPayment(input);
  if (!payment.itemKey) {
    const error = new Error('itemKey is required');
    error.status = 400;
    throw error;
  }
  if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
    const error = new Error('amount must be greater than 0');
    error.status = 400;
    throw error;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payment.date)) {
    const error = new Error('date must use YYYY-MM-DD');
    error.status = 400;
    throw error;
  }
  if (!payment.method) {
    const error = new Error('method is required');
    error.status = 400;
    throw error;
  }
  return payment;
}

export function getQuotePaymentStatus(paid, balance) {
  if (paid <= 0) return 'Unpaid';
  if (balance <= 0) return 'Paid';
  return 'Partial';
}

function reconcileSchedule(quote = {}, options = {}) {
  const on = options.on || new Date().toISOString().slice(0, 10);
  const schedule = buildBaseSchedule(quote, on).map((item) => ({ ...item, paidAmount: 0 }));
  const byItem = new Map(schedule.map((item) => [item.itemKey, item]));
  const payments = normalizePaymentList(quote.payments, quote, { on });

  if (payments.length) {
    for (const payment of payments) {
      const item = byItem.get(payment.itemKey);
      if (item) item.paidAmount = roundMoney(item.paidAmount + payment.amount);
    }
  } else {
    for (const item of buildBaseSchedule(quote, on)) {
      const target = byItem.get(item.itemKey);
      if (target) target.paidAmount = roundMoney(item.paidAmount);
    }
  }

  return { schedule: schedule.map(withScheduleDerived), payments };
}

export function buildQuotePaymentView(id, quote = {}, options = {}) {
  const { schedule, payments } = reconcileSchedule(quote, options);
  const milestones = schedule.filter((item) => item.itemKey.startsWith('milestone:')).map((item) => ({
    key: item.key,
    itemKey: item.itemKey,
    label: item.label,
    amount: item.amount,
    dueDate: item.dueDate || '',
    paidAmount: item.paidAmount,
    remaining: item.remaining,
    state: item.state,
    status: item.status,
    collectedAt: item.collectedAt || ''
  }));
  const buildTotal = roundMoney(milestones.reduce((sum, item) => sum + item.amount, 0));
  const paid = roundMoney(milestones.reduce((sum, item) => sum + Math.min(item.paidAmount, item.amount), 0));
  const buildBalance = roundMoney(Math.max(0, buildTotal - paid));
  const careOutstanding = roundMoney(schedule
    .filter((item) => item.itemKey.startsWith('care:') && compareIso(item.dueDate, options.on || new Date().toISOString().slice(0, 10)) <= 0)
    .reduce((sum, item) => sum + item.remaining, 0));

  return {
    id,
    quoteRef: String(quote.quoteNumber || quote.ref || quote.quoteRef || id || '').trim(),
    quoteNumber: quote.quoteNumber || '',
    customer: quote.customer || null,
    language: quote.language || 'en',
    lineItems: Array.isArray(quote.lineItems) ? quote.lineItems : [],
    pages: quote.pages || null,
    terms: quote.terms || null,
    notes: quote.notes || null,
    validDays: quote.validDays || 30,
    vatPercent: Number.isFinite(Number(quote.vatPercent)) ? Number(quote.vatPercent) : 0,
    createdAt: quote.createdAt || null,
    lastSentAt: quote.lastSentAt || null,
    workflowStatus: quote.status || 'draft',
    remarks: quote.remarks || '',
    passcodePlain: quote._passcodePlain || '',
    goLiveDate: quote.goLiveDate || '',
    billingDay: quote.billingDay || 0,
    careMonthly: quote.careMonthly || 0,
    careCollected: Array.isArray(quote.careCollected) ? quote.careCollected : [],
    careWaived: Array.isArray(quote.careWaived) ? quote.careWaived : [],
    firstMonthFree: quote.firstMonthFree === true,
    milestones,
    schedule,
    total: buildTotal,
    buildTotal,
    paid,
    balance: buildBalance,
    buildBalance,
    careOutstanding,
    outstanding: roundMoney(buildBalance + careOutstanding),
    status: getQuotePaymentStatus(paid, buildBalance),
    paymentStatus: getQuotePaymentStatus(paid, buildBalance),
    payments
  };
}

export function buildQuotePaymentFields(id, quote = {}, options = {}) {
  const view = buildQuotePaymentView(id, quote, options);
  return {
    payments: view.payments,
    milestones: view.milestones,
    paid: view.paid,
    balance: view.balance,
    buildTotal: view.buildTotal,
    buildBalance: view.buildBalance,
    careOutstanding: view.careOutstanding,
    outstanding: view.outstanding,
    paymentStatus: view.status
  };
}

export function applyPaymentToQuote(id, quote = {}, paymentInput = {}, options = {}) {
  const payment = normalizePaymentInput(paymentInput);
  const view = buildQuotePaymentView(id, quote, options);
  const target = view.schedule.find((item) => item.itemKey === payment.itemKey);
  if (!target) {
    const error = new Error('itemKey does not match a payable schedule item');
    error.status = 400;
    throw error;
  }
  if (payment.amount > target.remaining) {
    const error = new Error('payment amount exceeds remaining item balance');
    error.status = 400;
    throw error;
  }

  const payments = [...view.payments, payment];
  const nextQuote = { ...quote, payments };
  return {
    ...nextQuote,
    ...buildQuotePaymentFields(id, nextQuote, options)
  };
}

export function stripInternalPaymentFields(quote = {}) {
  const safe = { ...quote };
  for (const field of PAYMENT_INTERNAL_FIELDS) {
    delete safe[field];
  }
  return safe;
}

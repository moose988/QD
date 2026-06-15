import assert from 'node:assert/strict';

import {
  buildQuoteListRow,
  buildQuoteSearchFields,
  normalizeQuoteWorkflowStatus,
  sanitizePublicQuote
} from '../api/_lib/quote-admin.js';

const quote = {
  quoteNumber: 'Q-2026-007',
  status: 'sent',
  remarks: 'Follow up Monday',
  customer: { businessName: 'Sea Land' },
  lineItems: [{ qty: 2, unitPrice: 1000 }],
  pages: { price: 500 },
  vatPercent: 5,
  payments: [{ amount: 750, date: '2026-06-15', method: 'Bank transfer' }],
  paid: 750,
  balance: 1875,
  paymentStatus: 'Partial',
  lastSentAt: { _seconds: 1781481600 },
  createdAt: { _seconds: 1781395200 },
  passcodeHash: 'secret',
  _passcodePlain: '123456',
  estimateSnapshot: {
    marginPercent: 70,
    costFloorNet: 1200,
    selection: { foundationId: 'web-base' }
  }
};

assert.deepEqual(buildQuoteSearchFields(quote), {
  quoteNumberLower: 'q-2026-007',
  businessNameLower: 'sea land'
});

assert.equal(normalizeQuoteWorkflowStatus('accepted'), 'accepted');
assert.equal(normalizeQuoteWorkflowStatus('ACTIVE'), 'sent');
assert.throws(() => normalizeQuoteWorkflowStatus('archived'), /Invalid quote status/);

assert.deepEqual(buildQuoteListRow('quote-doc-id', quote), {
  id: 'quote-doc-id',
  quoteNumber: 'Q-2026-007',
  businessName: 'Sea Land',
  createdAt: quote.createdAt,
  total: 2625,
  status: 'sent',
  paid: 750,
  balance: 1875,
  paymentStatus: 'Partial',
  lastSentAt: quote.lastSentAt,
  remarks: 'Follow up Monday'
});

assert.deepEqual(
  sanitizePublicQuote({
    ...quote,
    notes: { en: 'Client-facing note' },
    _private: true
  }),
  {
    quoteNumber: 'Q-2026-007',
    customer: { businessName: 'Sea Land' },
    lineItems: [{ qty: 2, unitPrice: 1000 }],
    pages: { price: 500 },
    vatPercent: 5,
    createdAt: quote.createdAt,
    notes: { en: 'Client-facing note' }
  }
);

console.log('QUOTE ADMIN HELPERS HOLD');

import assert from 'node:assert/strict';
import { renderQuoteTemplate, normalizeQuoteForTemplate } from '../app/lib/quote-template.js';

const quote = {
  id: 'quote-abc',
  quoteNumber: 'Q-2026-012',
  createdAt: '2026-06-16T00:00:00.000Z',
  validDays: 30,
  vatPercent: 0,
  vatInclusive: true,
  customer: {
    businessName: 'Sea Land',
    email: 'client@example.com',
    phone: '+971 55 000 0000'
  },
  notes: { en: 'Website and ordering workflow.' },
  lineItems: [
    {
      catalogKey: 'qd-build',
      name: { en: 'One-time build', ar: 'البناء لمرة واحدة' },
      qty: 1,
      unitPrice: 8120,
      includes: ['Ordering', 'Analytics']
    },
    {
      catalogKey: 'whatsapp_integration',
      name: { en: 'WhatsApp integration', ar: 'تكامل واتساب' },
      qty: 1,
      unitPrice: 0,
      includes: ['Click-to-chat handoff']
    },
    {
      catalogKey: 'third-party-software',
      name: { en: 'Third-party software at cost', ar: 'برامج الطرف الثالث بالتكلفة' },
      qty: 1,
      unitPrice: 0,
      billingNote: 'At cost'
    }
  ],
  careMonthly: 149,
  carePlanName: 'Care Basic',
  terms: {
    en: [
      'Payment: 30% advance and 70% on completion.',
      'Ownership transfers after final payment.'
    ]
  }
};

const normalized = normalizeQuoteForTemplate(quote);
assert.equal(normalized.quoteNumberDisplay, 'Q-012-2026');
assert.equal(normalized.lineItems.some((line) => line.catalogKey === 'monthly-care'), false);
assert.equal(normalized.careMonthly, 149);
assert.deepEqual(normalized.paymentSchedule.map((item) => item.amount), [2436, 5684]);

const readonlyHtml = renderQuoteTemplate(quote, { editable: false, lang: 'en', quoteUrl: 'https://qdsystems.ae/q/quote-abc' });
assert.match(readonlyHtml, /REF Q-012-2026/);
assert.match(readonlyHtml, /Dubai, United Arab Emirates/);
assert.match(readonlyHtml, /Prices are inclusive of VAT/);
assert.match(readonlyHtml, /Monthly care/);
assert.match(readonlyHtml, /Care Basic/);
assert.match(readonlyHtml, /AED 149\/mo/);
assert.match(readonlyHtml, /WhatsApp integration[\s\S]*Third-party software at cost/);
assert.doesNotMatch(readonlyHtml, /costFloorNet|marginPercent|payments|careCollected/);

const editableHtml = renderQuoteTemplate(quote, { editable: true, lang: 'en', quoteUrl: 'https://qdsystems.ae/q/quote-abc' });
assert.match(editableHtml, /data-qfield="customer\.businessName"/);
assert.match(editableHtml, /data-qline="0\.includes\.1"/);
assert.match(editableHtml, /data-action="quote-remove-include"/);
assert.match(editableHtml, /data-action="quote-move-line-up"/);
assert.match(editableHtml, /data-qfield="careMonthly"/);
assert.match(editableHtml, /data-qterm="0"/);

console.log('QUOTE TEMPLATE TESTS PASS');

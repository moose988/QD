import test from 'node:test';
import assert from 'node:assert/strict';
import { degradedReply } from '../api/_lib/degraded.js';

const chunk = (text, extra = {}) => ({ id: 'c1', source: 'events.md', lang: 'en', heading: 'Existing customers: login', text, ...extra });

test('offline mode never repeats instructions to the bot or pastes URLs', () => {
  const r = degradedReply({
    message: 'where do I log in for my event',
    lang: 'en',
    chunks: [chunk('If someone already has an event with QD, send them to the customer login: https://events.qdsystems.ae/customer-login.html. We avoid generic agency-speak in every reply. Customers sign in through the customer login page linked from the QD Events page.')],
  });
  assert.ok(!/https?:|send them|avoid generic/i.test(r.text), r.text);
});

test('offline mode needs a real match for broad questions and falls back honestly otherwise', () => {
  const r = degradedReply({ message: 'i want to speak to a real person', lang: 'en', chunks: [chunk('We avoid generic agency-speak and write like people do in every reply we send.', { source: 'company.md' })] });
  assert.equal(r.matched, false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAttentionItems } from '../app/lib/admin-attention.js';

test('only triggered attention alerts are displayed', () => {
  const items = [
    { key: 'new', count: 0 }, { key: 'followup', count: 2 },
    { key: 'meetings', count: 1 }, { key: 'quotes', count: 0 },
    { key: 'collections', count: null }
  ];
  assert.deepEqual(activeAttentionItems(items).map((item) => item.key), ['followup', 'meetings']);
});

test('payment and quote alerts appear when triggered and disappear once resolved', () => {
  const alerts = (quotes, payments) => activeAttentionItems([
    { key: 'quotes', count: quotes }, { key: 'collections', count: payments }
  ]).map((item) => item.key);
  assert.deepEqual(alerts(1, 2), ['quotes', 'collections']);
  assert.deepEqual(alerts(0, 0), []);
  assert.deepEqual(alerts(0, null), []);
});

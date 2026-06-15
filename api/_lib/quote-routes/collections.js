// GET /api/collections?on=YYYY-MM-DD - admin-only collections cockpit data.

import { getDb } from '../firebase.js';
import { requireAdmin } from '../admin-auth.js';
import { getQueryParam } from '../quote-admin.js';
import { buildCollectionsSummary, todayIso } from '../collections.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

async function loadQuotes(db) {
  const snap = await db.collection('quotes').get();
  const quotes = [];
  snap.forEach((doc) => quotes.push({ id: doc.id, ...doc.data() }));
  return quotes;
}

export default async function handler(req, res) {
  console.log('[collections] hit', { method: req.method, url: req.url });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    try {
      await requireAdmin(req);
    } catch (error) {
      console.warn('[collections] auth failed:', error.message);
      return res.status(401).json({ error: error.message });
    }

    const on = String(getQueryParam(req, 'on') || todayIso()).trim();
    const quotes = await loadQuotes(getDb());
    return res.status(200).json(buildCollectionsSummary(quotes, on));
  } catch (error) {
    console.error('[collections] unhandled error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
}

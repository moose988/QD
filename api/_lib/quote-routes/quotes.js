// GET /api/quotes?q=&status= - admin-only quotation list.

import { getDb } from '../firebase.js';
import { requireAdmin } from '../admin-auth.js';
import {
  buildQuoteListRow,
  buildQuoteSearchFields,
  getQueryParam,
  normalizeQuoteWorkflowStatus,
  quoteMatchesSearch,
  resolveQuoteByRef
} from '../quote-admin.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value._seconds) return value._seconds * 1000;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

async function querySearch(db, qLower) {
  const queries = [
    db.collection('quotes').orderBy('quoteNumberLower').startAt(qLower).endAt(`${qLower}\uf8ff`).limit(100).get(),
    db.collection('quotes').orderBy('businessNameLower').startAt(qLower).endAt(`${qLower}\uf8ff`).limit(100).get()
  ];
  const snaps = await Promise.all(queries);
  const byId = new Map();
  for (const snap of snaps) {
    snap.forEach((doc) => byId.set(doc.id, { id: doc.id, ...doc.data() }));
  }
  return Array.from(byId.values());
}

async function loadSearchDocs(db, q) {
  const docs = await querySearch(db, q.toLowerCase());
  if (docs.length) return docs;
  const exact = await resolveQuoteByRef(db, q);
  return exact ? [{ id: exact.id, ...exact.data }] : [];
}

export default async function handler(req, res) {
  console.log('[quotes] hit', { method: req.method, url: req.url });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    try {
      await requireAdmin(req);
    } catch (error) {
      console.warn('[quotes] auth failed:', error.message);
      return res.status(401).json({ error: error.message });
    }

    const q = String(getQueryParam(req, 'q') || '').trim();
    const statusRaw = String(getQueryParam(req, 'status') || '').trim();
    const status = statusRaw && statusRaw.toLowerCase() !== 'all'
      ? normalizeQuoteWorkflowStatus(statusRaw)
      : '';

    const db = getDb();
    const docs = q
      ? await loadSearchDocs(db, q)
      : await db.collection('quotes').orderBy('createdAt', 'desc').get().then((snap) => {
          const rows = [];
          snap.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
          return rows;
        });

    const rows = docs
      .map((quote) => {
        const withSearch = {
          ...quote,
          ...(!quote.quoteNumberLower || !quote.businessNameLower ? buildQuoteSearchFields(quote) : {})
        };
        return buildQuoteListRow(quote.id, withSearch);
      })
      .filter((row) => !q || quoteMatchesSearch(row, q))
      .filter((row) => !status || row.status === status)
      .sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt));

    return res.status(200).json({ quotes: rows });
  } catch (error) {
    console.error('[quotes] unhandled error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
}

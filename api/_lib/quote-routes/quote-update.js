// POST /api/quote-update { ref|id, status?, remarks?, markSent?, markGoLive?, goLiveDate?, milestoneDueDates? }
// Admin-only workflow metadata updates for quotations.

import { getDb, admin } from '../firebase.js';
import { requireAdmin } from '../admin-auth.js';
import {
  buildQuoteListRow,
  buildQuoteSearchFields,
  getQuoteRefFromRequest,
  normalizeQuoteWorkflowStatus,
  parseJsonBody,
  resolveQuoteByRef
} from '../quote-admin.js';
import {
  buildDefaultMilestones,
  getCareMonthly,
  getQuoteTotal,
  normalizeMilestones,
  toIsoDate,
  todayIso
} from '../collections.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

function normalizeGoLiveDate(value) {
  const date = toIsoDate(value) || todayIso();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error('goLiveDate must use YYYY-MM-DD');
    error.status = 400;
    throw error;
  }
  return date;
}

function applyMilestoneDueDates(quote, milestoneDueDates) {
  if (!milestoneDueDates || typeof milestoneDueDates !== 'object') return null;
  return normalizeMilestones(quote).map((milestone) => {
    const dueDate = milestoneDueDates[milestone.key];
    if (dueDate == null) return milestone;
    return { ...milestone, dueDate: toIsoDate(dueDate) || '' };
  });
}

export default async function handler(req, res) {
  console.log('[quote-update] hit', { method: req.method, url: req.url });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    try {
      await requireAdmin(req);
    } catch (error) {
      console.warn('[quote-update] auth failed:', error.message);
      return res.status(401).json({ error: error.message });
    }

    const body = parseJsonBody(req);
    const quoteRef = getQuoteRefFromRequest(req, body);
    if (!quoteRef) return res.status(400).json({ error: 'ref or id is required' });

    const db = getDb();
    const resolved = await resolveQuoteByRef(db, quoteRef);
    if (!resolved) return res.status(404).json({ error: 'Quote not found' });

    const existing = resolved.data || {};
    const safe = {};
    if (body.status != null) safe.status = normalizeQuoteWorkflowStatus(body.status);
    if (body.remarks != null) safe.remarks = String(body.remarks || '').trim();
    if (body.markSent === true) {
      safe.status = 'sent';
      safe.lastSentAt = admin.firestore.FieldValue.serverTimestamp();
    }
    if (body.markGoLive === true) {
      const goLiveDate = normalizeGoLiveDate(body.goLiveDate);
      const day = Number(goLiveDate.slice(8, 10));
      safe.goLiveDate = goLiveDate;
      safe.billingDay = day;
      safe.careMonthly = getCareMonthly(existing);
      safe.careCollected = Array.isArray(existing.careCollected) ? existing.careCollected : [];
    }
    const milestoneDueDates = applyMilestoneDueDates({ ...existing, ...safe }, body.milestoneDueDates);
    if (milestoneDueDates) safe.milestones = milestoneDueDates;
    if (!safe.milestones && !Array.isArray(existing.milestones)) {
      safe.milestones = buildDefaultMilestones(getQuoteTotal(existing));
    }

    safe.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    Object.assign(safe, buildQuoteSearchFields({ ...existing, ...safe }));

    await resolved.ref.set(safe, { merge: true });
    const after = await resolved.ref.get();
    return res.status(200).json({ quote: buildQuoteListRow(after.id, after.data() || {}) });
  } catch (error) {
    console.error('[quote-update] unhandled error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
}

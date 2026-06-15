// POST /api/quote-update { ref|id, status?, remarks?, markSent?, markGoLive?, goLiveDate?, milestoneDueDates? }
// Admin-only workflow metadata updates for quotations.

import { getDb, admin } from '../firebase.js';
import { requireAdmin } from '../admin-auth.js';
import { logQuoteAudit } from '../audit-log.js';
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
import { buildQuotePaymentFields, buildQuotePaymentView } from '../quote-payments.js';

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
      var adminUser = await requireAdmin(req);
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
    if (body.delete === true) {
      await logQuoteAudit({
        action: 'deleted_quote',
        quoteId: resolved.id,
        quoteNumber: resolved.data?.quoteNumber,
        actor: adminUser,
        details: `Deleted quote ${resolved.data?.quoteNumber || resolved.id}`
      });
      await resolved.ref.delete();
      return res.status(200).json({ ok: true, deleted: true, id: resolved.id });
    }

    const existing = resolved.data || {};
    const safe = {};
    if (body.status != null) safe.status = normalizeQuoteWorkflowStatus(body.status);
    if (body.remarks != null) safe.remarks = String(body.remarks || '').trim();
    if (body.firstMonthFree != null) safe.firstMonthFree = body.firstMonthFree === true;
    if (body.waiveCare?.monthKey) {
      const monthKey = String(body.waiveCare.monthKey).trim();
      const careItem = buildQuotePaymentView(resolved.id, existing).schedule.find((item) => item.itemKey === `care:${monthKey}`);
      if (careItem && careItem.paidAmount > 0) {
        const error = new Error('Cannot waive a collected care month');
        error.status = 409;
        throw error;
      }
      const existingWaived = Array.isArray(existing.careWaived) ? existing.careWaived.map(String) : [];
      safe.careWaived = Array.from(new Set([...existingWaived, monthKey])).sort();
    }
    if (body.unwaiveCare?.monthKey) {
      const monthKey = String(body.unwaiveCare.monthKey).trim();
      const existingWaived = Array.isArray(existing.careWaived) ? existing.careWaived.map(String) : [];
      safe.careWaived = existingWaived.filter((item) => item !== monthKey);
    }
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
    Object.assign(safe, buildQuotePaymentFields(resolved.id, { ...existing, ...safe }));
    Object.assign(safe, buildQuoteSearchFields({ ...existing, ...safe }));

    await resolved.ref.set(safe, { merge: true });
    const after = await resolved.ref.get();
    const afterData = after.data() || {};
    if (body.markSent === true) {
      await logQuoteAudit({ action: 'marked_sent', quoteId: resolved.id, quoteNumber: afterData.quoteNumber, actor: adminUser, details: `Marked ${afterData.quoteNumber || resolved.id} as sent` });
    } else if (body.status != null && safe.status !== existing.status) {
      await logQuoteAudit({ action: 'changed_quote_status', quoteId: resolved.id, quoteNumber: afterData.quoteNumber, actor: adminUser, details: `Status: ${existing.status || 'draft'} -> ${safe.status}` });
    } else if (body.markGoLive === true) {
      await logQuoteAudit({ action: 'marked_go_live', quoteId: resolved.id, quoteNumber: afterData.quoteNumber, actor: adminUser, details: `Set go-live date ${safe.goLiveDate}` });
    } else if (body.waiveCare?.monthKey) {
      await logQuoteAudit({ action: 'waived_care', quoteId: resolved.id, quoteNumber: afterData.quoteNumber, actor: adminUser, details: `Waived care ${body.waiveCare.monthKey}` });
    } else if (body.unwaiveCare?.monthKey) {
      await logQuoteAudit({ action: 'unwaived_care', quoteId: resolved.id, quoteNumber: afterData.quoteNumber, actor: adminUser, details: `Un-waived care ${body.unwaiveCare.monthKey}` });
    } else if (body.firstMonthFree != null) {
      await logQuoteAudit({ action: 'update_quote', quoteId: resolved.id, quoteNumber: afterData.quoteNumber, actor: adminUser, details: `First month free: ${existing.firstMonthFree === true ? 'on' : 'off'} -> ${safe.firstMonthFree ? 'on' : 'off'}` });
    } else {
      await logQuoteAudit({ action: 'update_quote', quoteId: resolved.id, quoteNumber: afterData.quoteNumber, actor: adminUser, details: `Updated quote ${afterData.quoteNumber || resolved.id}` });
    }
    return res.status(200).json({ quote: buildQuoteListRow(after.id, afterData) });
  } catch (error) {
    console.error('[quote-update] unhandled error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
}

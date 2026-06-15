// GET /api/collections-digest?secret=... - Vercel Cron daily internal collections digest.

import { getDb } from './_lib/firebase.js';
import { getQueryParam } from './_lib/quote-admin.js';
import { buildCollectionsSummary, todayIso } from './_lib/collections.js';
import { escapeHtml, getAdminRecipients, safeError, sendZohoMail } from './_lib/zoho-mail.js';

export const config = { runtime: 'nodejs', maxDuration: 15 };

function getSecret(req) {
  const authorization = String(req.headers.authorization || req.headers.Authorization || '').trim();
  if (authorization.startsWith('Bearer ')) return authorization.slice('Bearer '.length).trim();
  return String(
    req.headers['x-cron-secret']
    || req.headers['X-Cron-Secret']
    || getQueryParam(req, 'secret')
    || ''
  ).trim();
}

function assertCronSecret(req) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (!expected) {
    const error = new Error('CRON_SECRET is not configured');
    error.status = 503;
    throw error;
  }
  if (getSecret(req) !== expected) {
    const error = new Error('Unauthorized');
    error.status = 401;
    throw error;
  }
}

async function loadQuotes() {
  const snap = await getDb().collection('quotes').get();
  const quotes = [];
  snap.forEach((doc) => quotes.push({ id: doc.id, ...doc.data() }));
  return quotes;
}

function money(value) {
  return new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function adminQuoteUrl(item) {
  return `https://qdsystems.ae/admin?tab=payments&q=${encodeURIComponent(item.quoteNumber || item.quoteId || '')}`;
}

function rowsText(title, items) {
  if (!items.length) return `${title}: none`;
  return [
    `${title}:`,
    ...items.map((item) => `- ${item.client || 'Client'} - ${item.quoteNumber} - ${item.type} - AED ${money(item.amount)} - due ${item.dueDate} - ${adminQuoteUrl(item)}`)
  ].join('\n');
}

function rowsHtml(title, items) {
  const rows = items.length
    ? items.map((item) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.client || 'Client')}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.quoteNumber || '')}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.type || '')}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.dueDate || '')}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">AED ${escapeHtml(money(item.amount))}</td>
      </tr>
    `).join('')
    : '<tr><td style="padding:8px;color:#6b7280;" colspan="5">None</td></tr>';
  return `
    <h2 style="font-size:16px;margin:22px 0 8px;">${escapeHtml(title)}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px;">
      <thead><tr style="background:#f3f4f6;"><th align="left" style="padding:8px;">Client</th><th align="left" style="padding:8px;">Ref</th><th align="left" style="padding:8px;">Item</th><th align="left" style="padding:8px;">Due</th><th align="right" style="padding:8px;">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildDigest(summary) {
  const overdue = summary.buckets.overdue.items;
  const dueToday = summary.buckets.dueToday.items;
  const subject = `QD Collections - ${dueToday.length} due today, ${overdue.length} overdue (AED ${money(summary.buckets.dueToday.total + summary.buckets.overdue.total)})`;
  const text = [
    `QD Collections for ${summary.on}`,
    '',
    rowsText('Overdue', overdue),
    '',
    rowsText('Due today', dueToday)
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:760px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
      <h1 style="font-size:20px;margin:0 0 4px;">QD Collections</h1>
      <p style="margin:0 0 16px;color:#6b7280;">${escapeHtml(summary.on)} - Internal admin digest</p>
      ${rowsHtml('Overdue', overdue)}
      ${rowsHtml('Due today', dueToday)}
      <p style="margin-top:18px;color:#6b7280;font-size:12px;">Open the admin Collections tab to mark items collected.</p>
    </div>
  </body></html>`;
  return { subject, text, html };
}

export default async function handler(req, res) {
  console.log('[collections-digest] hit', { method: req.method, url: req.url });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    assertCronSecret(req);
    const summary = buildCollectionsSummary(await loadQuotes(), todayIso());
    const recipients = getAdminRecipients();
    if (!recipients.length) return res.status(503).json({ error: 'QD_ADMIN_EMAILS missing or invalid' });

    const digest = buildDigest(summary);
    await sendZohoMail({
      to: recipients,
      subject: digest.subject,
      text: digest.text,
      html: digest.html
    });
    return res.status(200).json({ ok: true, sent: true, count: summary.count, total: summary.total });
  } catch (error) {
    console.error('[collections-digest] error:', safeError(error));
    return res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
}

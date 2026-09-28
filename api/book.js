// POST /api/book — validate a call request and email the customer a receipt.
// Calendar and video-call provisioning are intentionally outside this flow.

import { createHash, randomUUID } from 'node:crypto';
import {
  CONTACT_REPLY,
  escapeHtml,
  isEmail,
  sendZohoMail,
  validateSmtpEnv,
} from './_lib/zoho-mail.js';

export const config = { runtime: 'nodejs', maxDuration: 15 };

const TIME_ZONE = 'Asia/Dubai';
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const completedRequests = new Map();
const activeRequests = new Map();

function validateRequest(body) {
  const name = String(body.name || '').trim().slice(0, 120);
  const phone = String(body.phone || '').trim().slice(0, 60);
  const email = String(body.email || '').trim().slice(0, 200);
  const purpose = String(body.purpose || body.topic || '').trim().slice(0, 300);
  const preferredDate = String(body.preferredDate || '').trim();
  const preferredTime = String(body.preferredTime || '').trim();

  if (!name) return { error: 'Please enter your name.' };
  if (!/^\+?[\d\s().-]{7,24}$/.test(phone) || phone.replace(/\D/g, '').length < 7) {
    return { error: 'Please enter a valid phone number.' };
  }
  if (!isEmail(email)) return { error: 'Please enter a valid email address.' };
  if (!purpose) return { error: 'Please choose a topic for your call.' };

  const dateMatch = preferredDate.match(DATE_RE);
  const timeMatch = preferredTime.match(TIME_RE);
  if (!dateMatch || !timeMatch) return { error: 'Please choose a valid preferred date and time.' };
  const [, year, month, day] = dateMatch.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { error: 'Please choose a valid preferred date.' };
  }

  // Dubai uses UTC+04:00. Interpret the submitted date/time as Dubai wall time,
  // independent of the browser or server's configured timezone.
  const requestedAt = Date.parse(`${preferredDate}T${preferredTime}:00+04:00`);
  if (!Number.isFinite(requestedAt) || requestedAt <= Date.now()) {
    return { error: 'Please choose a future preferred date and time.' };
  }

  return { value: { name, phone, email, purpose, preferredDate, preferredTime } };
}

function formatPreferredDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatPreferredTime(value) {
  const [hour, minute] = value.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const twelveHour = hour % 12 || 12;
  return `${String(twelveHour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;
}

export function buildBookingConfirmation(details) {
  const preferredDate = formatPreferredDate(details.preferredDate);
  const preferredTime = formatPreferredTime(details.preferredTime);
  const text = `Hi ${details.name},

Thank you for your interest in QD Systems. We’ve received your request for a free call.

Topic: ${details.purpose}
Preferred date: ${preferredDate}
Preferred time: ${preferredTime} (${TIME_ZONE})

The date and time above are preferences only, not a confirmed appointment. Our team will contact you to arrange the call.

Regards,
QD Systems
contact@qdsystems.ae`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body style="margin:0;background:#0a0a0c;color:#e8e6e3;font:15px/1.65 Arial,sans-serif;padding:28px 16px"><main style="max-width:560px;margin:auto;padding:30px;border:1px solid #2a2a2e;border-radius:12px;background:#121214"><p style="margin:0 0 8px;color:#a9a59f;letter-spacing:.14em;text-transform:uppercase;font-size:12px">QD Systems</p><h1 style="font-size:22px;font-weight:600">We received your call request</h1><p>Hi ${escapeHtml(details.name)},</p><p>Thank you for your interest in QD Systems. We’ve received your request for a free call.</p><p><strong>Topic:</strong> ${escapeHtml(details.purpose)}<br><strong>Preferred date:</strong> ${escapeHtml(preferredDate)}<br><strong>Preferred time:</strong> ${escapeHtml(preferredTime)} (${TIME_ZONE})</p><p style="color:#b8b4ae">The date and time above are preferences only, not a confirmed appointment. Our team will contact you to arrange the call.</p><p>Regards,<br>QD Systems<br><a href="mailto:contact@qdsystems.ae" style="color:#c8c4be">contact@qdsystems.ae</a></p></main></body></html>`;
  return { subject: 'We received your call request — QD Systems', text, html };
}

function providerDiagnostics(error) {
  const providerMessage = String(error?.response || error?.message || 'Email provider request failed')
    .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi, '[address]')
    .replace(/\b(pass(?:word)?|token|authorization)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\b(?:Bearer|Basic)\s+\S+/gi, '[authorization redacted]')
    .slice(0, 240);
  return {
    code: /^[A-Z0-9_-]{1,48}$/i.test(String(error?.code || '')) ? String(error.code) : 'SMTP_ERROR',
    responseCode: Number.isInteger(Number(error?.responseCode)) ? Number(error.responseCode) : null,
    command: /^[A-Z]{1,16}$/i.test(String(error?.command || '')) ? String(error.command) : null,
    message: providerMessage,
  };
}

function wasAccepted(info, email) {
  const accepted = Array.isArray(info?.accepted) ? info.accepted : [];
  return accepted.some((address) => String(address).toLowerCase() === email.toLowerCase());
}

function cleanupIdempotencyCache(now = Date.now()) {
  for (const [key, record] of completedRequests) {
    if (record.expiresAt <= now) completedRequests.delete(key);
  }
}

export function createBookingHandler(dependencies = {}) {
  const mailSender = dependencies.sendMail || sendZohoMail;
  const now = dependencies.now || Date.now;

  return async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ code: 'INVALID_JSON', error: 'Invalid request.' }); }
    }
    const validated = validateRequest(body || {});
    if (validated.error) return res.status(400).json({ code: 'INVALID_BOOKING', error: validated.error });
    const details = validated.value;
    const idempotencyKey = String(body?.idempotencyKey || randomUUID()).trim().slice(0, 120);
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(idempotencyKey)) {
      return res.status(400).json({ code: 'INVALID_REQUEST_KEY', error: 'Please refresh the page and try again.' });
    }
    const requestFingerprint = createHash('sha256').update([
      details.name, details.email.toLowerCase(), details.phone, details.purpose,
      details.preferredDate, details.preferredTime,
    ].join('\n')).digest('hex');

    cleanupIdempotencyCache(now());
    const completed = completedRequests.get(idempotencyKey);
    if (completed) {
      if (completed.fingerprint !== requestFingerprint) {
        return res.status(409).json({ code: 'REQUEST_KEY_REUSED', error: 'This request was already used. Please refresh and try again.' });
      }
      return res.status(200).json(completed.response);
    }
    if (activeRequests.has(idempotencyKey)) {
      if (activeRequests.get(idempotencyKey) !== requestFingerprint) {
        return res.status(409).json({ code: 'REQUEST_KEY_REUSED', error: 'This request was already used. Please refresh and try again.' });
      }
      return res.status(409).json({ code: 'REQUEST_IN_PROGRESS', error: 'Your request is still being sent. Please wait a moment before retrying.' });
    }

    const missingSmtpConfig = dependencies.sendMail ? null : validateSmtpEnv();
    if (missingSmtpConfig) {
      console.error('[book-email] SMTP configuration missing', { code: 'EMAIL_NOT_CONFIGURED' });
      return res.status(503).json({ code: 'EMAIL_NOT_CONFIGURED', error: 'We could not send your request just now. Please try again shortly.' });
    }

    activeRequests.set(idempotencyKey, requestFingerprint);
    try {
      const message = buildBookingConfirmation(details);
      const info = await mailSender({
        to: details.email,
        ...message,
        replyTo: CONTACT_REPLY,
      });
      if (!wasAccepted(info, details.email)) {
        const error = new Error('SMTP provider did not accept the customer recipient.');
        error.code = 'RECIPIENT_NOT_ACCEPTED';
        throw error;
      }

      const response = { ok: true, emailAccepted: true };
      completedRequests.set(idempotencyKey, {
        fingerprint: requestFingerprint,
        response,
        expiresAt: now() + 30 * 60 * 1000,
      });
      console.log('[book-email] confirmation accepted by provider', { code: 'EMAIL_ACCEPTED' });
      return res.status(200).json(response);
    } catch (error) {
      console.error('[book-email] confirmation email failed', providerDiagnostics(error));
      const code = error?.code === 'RECIPIENT_NOT_ACCEPTED' ? 'EMAIL_RECIPIENT_REJECTED' : 'EMAIL_SEND_FAILED';
      return res.status(502).json({ code, error: 'We could not send your confirmation email. Please try again shortly.' });
    } finally {
      activeRequests.delete(idempotencyKey);
    }
  };
}

export default createBookingHandler();
